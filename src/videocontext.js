//Matthew Shotton, R&D User Experience,© BBC 2015
import VideoNode from "./SourceNodes/videonode.js";
import ImageNode from "./SourceNodes/imagenode.js";
import CanvasNode from "./SourceNodes/canvasnode.js";
import { SOURCENODESTATE } from "./SourceNodes/sourcenode.js";
import CompositingNode from "./ProcessingNodes/compositingnode.js";
import DestinationNode from "./DestinationNode/destinationnode.js";
import EffectNode from "./ProcessingNodes/effectnode.js";
import TransitionNode from "./ProcessingNodes/transitionnode.js";
import RenderGraph from "./rendergraph.js";
import VideoElementCache from "./videoelementcache.js";
import { createSigmaGraphDataFromRenderGraph, visualiseVideoContextTimeline, visualiseVideoContextGraph, createControlFormForNode, UpdateablesManager, exportToJSON, importSimpleEDL, snapshot, generateRandomId } from "./utils.js";
import DEFINITIONS from "./Definitions/definitions.js";

let updateablesManager = new UpdateablesManager();

/**
 * VideoContext.
 * @module VideoContext
 */
export default class VideoContext{
    /**
    * VideoContext类用于初始化一个videocontext对象
    * 第一个参数为一个canvas元素，视频画面将被渲染在这个元素上
    * 第二个参数为一个回调函数，在浏览器不支持webgl时自动调用
    *
    * @param {Canvas} canvas - 输出画面到这个canvas元素上
    * @param {function} initErrorCallback - 初始化失败后执行的回调函数
    * @param {Object} options - 自定义选项，建议使用默认设置
    *
    * @example 示例
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement, function(){console.error("Sorry, your browser dosen\'t support WebGL");});
    * var videoNode = ctx.video("video.mp4");
    * videoNode.connect(ctx.destination);
    * videoNode.start(0);
    * videoNode.stop(10);
    * ctx.play();
    *
    */
    constructor(canvas, initErrorCallback, options={"preserveDrawingBuffer":true, "manualUpdate":false, "endOnLastSourceEnd":true, useVideoElementCache:true, videoElementCacheSize:10, webglContextAttributes: {preserveDrawingBuffer: true, alpha: false }}){
        this._canvas = canvas;
        let manualUpdate = false;
        this.endOnLastSourceEnd = true;
        let webglContextAttributes = {preserveDrawingBuffer: true, alpha: false };

        if ("manualUpdate" in options) manualUpdate = options.manualUpdate;
        if ("endOnLastSourceEnd" in options) this._endOnLastSourceEnd = options.endOnLastSourceEnd;
        if ("webglContextAttributes" in options) webglContextAttributes = options.webglContextAttributes;

        if (webglContextAttributes.alpha === undefined) webglContextAttributes.alpha = false;
        if (webglContextAttributes.alpha === true){
            console.error("webglContextAttributes.alpha must be false for correct opeation");
        }


        this._gl = canvas.getContext("experimental-webgl", webglContextAttributes);
        if(this._gl === null){
            console.error("Failed to intialise WebGL.");
            if(initErrorCallback)initErrorCallback();
            return;
        }

        // 初始化video元素缓存
        if(options.useVideoElementCache === undefined) options.useVideoElementCache = true;
        this._useVideoElementCache = options.useVideoElementCache;
        if (this._useVideoElementCache){
            if (!options.videoElementCacheSize) options.videoElementCacheSize = 5;
            this._videoElementCache = new VideoElementCache(options.videoElementCacheSize);
        }
        
        // 为videocontext创建一个可以在调试器中使用的唯一ID
        if(this._canvas.id) {
            if (typeof this._canvas.id === "string" || this._canvas.id instanceof String){
                this._id = canvas.id;
            }
        }
        if(this._id === undefined) this._id = generateRandomId();
        if (window.__VIDEOCONTEXT_REFS__ === undefined) window.__VIDEOCONTEXT_REFS__ = {};
        window.__VIDEOCONTEXT_REFS__[this._id] = this;


        this._renderGraph = new RenderGraph();
        this._sourceNodes = [];
        this._processingNodes = [];
        this._timeline = [];
        this._currentTime = 0;
        this._state = VideoContext.STATE.PAUSED;
        this._playbackRate = 1.0;
        this._volume = 1.0;
        this._sourcesPlaying = undefined;
        this._destinationNode = new DestinationNode(this._gl, this._renderGraph);

        this._callbacks = new Map();
        this._callbacks.set("stalled", []);
        this._callbacks.set("update", []);
        this._callbacks.set("ended", []);
        this._callbacks.set("content", []);
        this._callbacks.set("nocontent", []);

        this._timelineCallbacks = [];

        if(!manualUpdate){
            updateablesManager.register(this);
        }
    }

    /**
     * 重新分配给videcontext实例的id，可能与canvas元素的id相同
     */
    get id(){
        return this._id;
    }

    /**
     * 给videocontext实例设置一个唯一的id
     */
    set id(newID){
        delete window.__VIDEOCONTEXT_REFS__[this._id];
        if (window.__VIDEOCONTEXT_REFS__[newID] !== undefined) console.warn("Warning; setting id to that of an existing VideoContext instance.");
        window.__VIDEOCONTEXT_REFS__[newID] = this;
        this._id = newID;
    }

    /**
    * 注册一个在特定时间点调用的回调函数
    * @param {number} time - 触发回调的时间
    * @param {Function} func - 注册的回调函数
    * @param {number} ordering - 用于指定注册多个回调函数时，函数执行的顺序
    */
    registerTimelineCallback(time, func, ordering= 0){
        this._timelineCallbacks.push({"time":time, "func":func, "ordering":ordering});
    }


    /**
    * 注销一个注册在特定时间点调用的回调函数
    * @param {Function} func - 需要注销的回调函数
    */
    unregisterTimelineCallback(func){
        let toRemove = [];
        for(let callback of this._timelineCallbacks){
            if (callback.func === func){
                toRemove.push(callback);
            }
        }
        for (let callback of toRemove){
            let index = this._timelineCallbacks.indexOf(callback);
            this._timelineCallbacks.splice(index, 1);
        }
    }

    /**
    * 注册用于在监听"stalled","update","ended","content","nocontent"事件发生时调用的回调函数
    * "stalled"是指播放的资源不可用，任何时候停止播放都会触发的事件
    * "update"任何时间点，当画面帧被渲染到屏幕上时都会触发
    * "ended"播放停止时
    * "content"当播放一个或多个sourcenode，并且有内容时调用
    * "nocontent"没有内容
    *
    * @param {String} type - 注册的事件
    * @param {Function} func - 注册的回调函数
    *
    * @example 示例
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    * ctx.registerCallback("stalled", function(){console.log("Playback stalled");});
    * ctx.registerCallback("update", function(){console.log("new frame");});
    * ctx.registerCallback("ended", function(){console.log("Playback ended");});
    */
    registerCallback(type, func){
        if (!this._callbacks.has(type)) return false;
        this._callbacks.get(type).push(func);
    }

    /**
    * 注销回调函数
    *
    * @param {Function} func - 需要注销的回调函数
    *
    * @example 示例
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    *
    * //the callback
    * var updateCallback = function(){console.log("new frame")};
    *
    * //register the callback
    * ctx.registerCallback("update", updateCallback);
    * //then unregister it
    * ctx.unregisterCallback(updateCallback);
    *
    */
    unregisterCallback(func){
        for(let funcArray of this._callbacks.values()){
            let index = funcArray.indexOf(func);
            if (index !== -1){
                funcArray.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    _callCallbacks(type){
        let funcArray = this._callbacks.get(type);
        for (let func of funcArray){
            func(this._currentTime);
        }
    }

    /**
    * 获取videocontext对象正在使用的canvas元素
    *
    * @return {HTMLElement} videocontext对象正在使用的canvas元素
    *
    */
    get element(){
        return this._canvas;
    }

    /**
    * 获取当前状态
    *
    * 将可能返回
    *  - VideoContext.STATE.PLAYING: 正在播放
    *  - VideoContext.STATE.PAUSED: 暂停
    *  - VideoContext.STATE.STALLED: 一个或多个资源无法播放
    *  - VideoContext.STATE.ENDED: 所有资源都已播放结束
    *  - VideoContext.STATE.BROKEN: 渲染中断
    * @return {number} 状态码
    *
    */
    get state(){
        return this._state;
    }

    /**
    * 设置当前播放进度
    * 可以利用这个函数实现一个时间轴
    *
    * @param {number} currentTime - 当前时间点
    *
    * @example 示例
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    * var videoNode = ctx.video("video.mp4");
    * videoNode.connect(ctx.destination);
    * videoNode.start(0);
    * videoNode.stop(20);
    * ctx.currentTime = 10; // seek 10 seconds in
    * ctx.play();
    *
    */
    set currentTime(currentTime){
        if (currentTime < this.duration && this._state === VideoContext.STATE.ENDED) this._state = VideoContext.STATE.PAUSED;

        if (typeof currentTime === "string" || currentTime instanceof String){
            currentTime = parseFloat(currentTime);
        }

        for (let i = 0; i < this._sourceNodes.length; i++) {
            this._sourceNodes[i]._seek(currentTime);
        }
        for (let i = 0; i < this._processingNodes.length; i++) {
            this._processingNodes[i]._seek(currentTime);
        }
        this._currentTime = currentTime;
    }

    /**
    * 获取当前的播放进度
    *
    * 获取当前播放进度，可以用来更新时间轴
    * @return {number} 当前播放时间点
    *
    * @example 示例
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    * var videoNode = ctx.video("video.mp4");
    * videoNode.connect(ctx.destination);
    * videoNode.start(0);
    * videoNode.stop(10);
    * ctx.play();
    * setTimeout(function(){console.log(ctx.currentTime);},1000); //should print roughly 1.0
    *
    */
    get currentTime(){
        return this._currentTime;
    }

    /**
    * 获取资源列表中最后一个资源播放结束的时间点
    *
    * @return {number} 最后一个视频资源播放结束的时间点
    *
    * @example 示例
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    * console.log(ctx.duration); //prints 0
    *
    * var videoNode = ctx.video("video.mp4");
    * videoNode.connect(ctx.destination);
    * videoNode.start(0);
    * videoNode.stop(10);
    *
    * console.log(ctx.duration); //prints 10
    *
    * ctx.play();
    */
    get duration(){
        let maxTime = 0;
        for (let i = 0; i < this._sourceNodes.length; i++) {
            if (this._sourceNodes[i].state !== SOURCENODESTATE.waiting &&this._sourceNodes[i]._stopTime > maxTime){
                maxTime = this._sourceNodes[i]._stopTime;
            }
        }
        return maxTime;
    }


    /**
    * 获取画布渲染时最终展示画面的节点，用于显示内容
    *
    * 这是只读属性，且只能有一个节点，其他节点可以通过connect函数连接到这个节点
    * 但是不能讲这个节点通过connect连接到其他节点
    *
    * @return {DestinationNode} 画布最终显示内容的图形节点
    * @example 示例
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    * var videoNode = ctx.video("video.mp4");
    * videoNode.start(0);
    * videoNode.stop(10);
    * videoNode.connect(ctx.destination);
    *
    */
    get destination(){
        return this._destinationNode;
    }

    /**
    * 设置videocontext实例的播放速度
    * 将会改变通过videocontext播放的所有媒体元素的播放速度
    *
    * @param {number} rate - 播放速度
    *
    * @example 示例
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    * var videoNode = ctx.video("video.mp4");
    * videoNode.start(0);
    * videoNode.stop(10);
    * videoNode.connect(ctx.destination);
    * ctx.playbackRate = 2;
    * ctx.play(); // Double playback rate means this will finish playing in 5 seconds.
    */
    set playbackRate(rate){
        if (rate <= 0){
            throw new RangeError("playbackRate must be greater than 0");
        }
        for (let node of this._sourceNodes) {
            if (node.constructor.name === "VideoNode"){
                node._globalPlaybackRate = rate;
                node._playbackRateUpdated = true;
            }
        }
        this._playbackRate = rate;
    }


    /**
    *  获取当前videocontext实例的播放速度
    * @return {number} 播放速度 默认为1.0
    */
    get playbackRate(){
        return this._playbackRate;
    }


    /**
     * 设置在videocontext实例中创建的所有videonode音量
     * @param {number} volume - 音量值
     */
    set volume(vol){
        for (let node of this._sourceNodes){
            if(node instanceof VideoNode){
                node.volume = vol;
            }
        }
        this._volume = vol;
    }

    /**
    *  获取当前音量
    * @return {number} 音量值 默认为1.0
    */
    get volume(){
        return this._volume;
    }

    /**
    * Start the VideoContext playing
    * @example
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    * var videoNode = ctx.video("video.mp4");
    * videoNode.connect(ctx.destination);
    * videoNode.start(0);
    * videoNode.stop(10);
    * ctx.play();
    */
    play(){
        console.debug("VideoContext - playing");
        //Initialise the video elemnt cache
        /**
         * 调用videoElementCache对象的init方法初始化缓存
         */
        if (this._videoElementCache)this._videoElementCache.init();
        // set the state.
        this._state = VideoContext.STATE.PLAYING;
        return true;
    }

    /**
    * Pause playback of the VideoContext
    * @example
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    * var videoNode = ctx.video("video.mp4");
    * videoNode.connect(ctx.destination);
    * videoNode.start(0);
    * videoNode.stop(20);
    * ctx.currentTime = 10; // seek 10 seconds in
    * ctx.play();
    * setTimeout(function(){ctx.pause();}, 1000); //pause playback after roughly one second.
    */
    pause(){
        console.debug("VideoContext - pausing");
        this._state = VideoContext.STATE.PAUSED;
        return true;
    }


    /**
    * Create a new node representing a video source
    *
    * @param {string|Video} - The URL or video element to create the video from.
    * @sourceOffset {number} - Offset into the start of the source video to start playing from.
    * @preloadTime {number} - How many seconds before the video is to be played to start loading it.
    * @videoElementAttributes {Object} - A dictionary of attributes to map onto the underlying video element.
    * @return {VideoNode} A new video node.
    *
    * @example
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    * var videoNode = ctx.video("video.mp4");
    *
    * @example
    * var canvasElement = document.getElementById("canvas");
    * var videoElement = document.getElementById("video");
    * var ctx = new VideoContext(canvasElement);
    * var videoNode = ctx.video(videoElement);
    */
    video(src, sourceOffset=0, preloadTime=4, videoElementAttributes={}){
        let videoNode = new VideoNode(src, this._gl, this._renderGraph, this._currentTime, this._playbackRate, sourceOffset, preloadTime, this._videoElementCache, videoElementAttributes);
        this._sourceNodes.push(videoNode);
        return videoNode;
    }

    /**
    * @depricated
    */
    createVideoSourceNode(src, sourceOffset=0, preloadTime=4, videoElementAttributes={}){
        this._depricate("Warning: createVideoSourceNode will be depricated in v1.0, please switch to using VideoContext.video()");
        return this.video(src, sourceOffset, preloadTime, videoElementAttributes);
    }


    /**
    * Create a new node representing an image source
    * @param {string|Image} src - The url or image element to create the image node from.
    * @param {number} [preloadTime] - How long before a node is to be displayed to attmept to load it.
    * @param {Object} [imageElementAttributes] - Any attributes to be given to the underlying image element.
    * @return {ImageNode} A new image node.
    *
    * @example
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    * var imageNode = ctx.image("image.png");
    *
    * @example
    * var canvasElement = document.getElementById("canvas");
    * var imageElement = document.getElementById("image");
    * var ctx = new VideoContext(canvasElement);
    * var imageNode = ctx.image(imageElement);
    */
    image(src, preloadTime=4, imageElementAttributes={}){
        let imageNode = new ImageNode(src, this._gl, this._renderGraph, this._currentTime, preloadTime, imageElementAttributes);
        this._sourceNodes.push(imageNode);
        return imageNode;
    }

    /**
    * @depricated
    */
    createImageSourceNode(src, sourceOffset=0, preloadTime=4, imageElementAttributes={}){
        this._depricate("Warning: createImageSourceNode will be depricated in v1.0, please switch to using VideoContext.image()");
        return this.image(src, sourceOffset, preloadTime, imageElementAttributes);
    }


    /**
    * Create a new node representing a canvas source
    * @param {Canvas} src - The canvas element to create the canvas node from.
    * @return {CanvasNode} A new canvas node.
    */
    canvas(canvas){
        let canvasNode = new CanvasNode(canvas, this._gl, this._renderGraph, this._currentTime);
        this._sourceNodes.push(canvasNode);
        return canvasNode;
    }

    /**
    * @depricated
    */
    createCanvasSourceNode(canvas, sourceOffset=0, preloadTime=4){
        this._depricate("Warning: createCanvasSourceNode will be depricated in v1.0, please switch to using VideoContext.canvas()");
        return this.canvas(canvas, sourceOffset, preloadTime);
    }


    /**
    * Create a new effect node.
    * @param {Object} definition - this is an object defining the shaders, inputs, and properties of the compositing node to create. Builtin definitions can be found by accessing VideoContext.DEFINITIONS.
    * @return {EffectNode} A new effect node created from the passed definition
    */
    effect(definition){
        debugger;
        let effectNode = new EffectNode(this._gl, this._renderGraph, definition);
        this._processingNodes.push(effectNode);
        return effectNode;
    }

    /**
    * @depricated
    */
    createEffectNode(definition){
        this._depricate("Warning: createEffectNode will be depricated in v1.0, please switch to using VideoContext.effect()");
        return this.effect(definition);
    }

    /**
    * Create a new compositiing node.
    *
    * Compositing nodes are used for operations such as combining multiple video sources into a single track/connection for further processing in the graph.
    *
    * A compositing node is slightly different to other processing nodes in that it only has one input in it's definition but can have unlimited connections made to it.
    * The shader in the definition is run for each input in turn, drawing them to the output buffer. This means there can be no interaction between the spearte inputs to a compositing node, as they are individually processed in seperate shader passes.
    *
    * @param {Object} definition - this is an object defining the shaders, inputs, and properties of the compositing node to create. Builtin definitions can be found by accessing VideoContext.DEFINITIONS
    *
    * @return {CompositingNode} A new compositing node created from the passed definition.
    *
    * @example
    *
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    *
    * //A simple compositing node definition which just renders all the inputs to the output buffer.
    * var combineDefinition = {
    *     vertexShader : "\
    *         attribute vec2 a_position;\
    *         attribute vec2 a_texCoord;\
    *         varying vec2 v_texCoord;\
    *         void main() {\
    *             gl_Position = vec4(vec2(2.0,2.0)*vec2(1.0, 1.0), 0.0, 1.0);\
    *             v_texCoord = a_texCoord;\
    *         }",
    *     fragmentShader : "\
    *         precision mediump float;\
    *         uniform sampler2D u_image;\
    *         uniform float a;\
    *         varying vec2 v_texCoord;\
    *         varying float v_progress;\
    *         void main(){\
    *             vec4 color = texture2D(u_image, v_texCoord);\
    *             gl_FragColor = color;\
    *         }",
    *     properties:{
    *         "a":{type:"uniform", value:0.0},
    *     },
    *     inputs:["u_image"]
    * };
    * //Create the node, passing in the definition.
    * var trackNode = videoCtx.compositor(combineDefinition);
    *
    * //create two videos which will play at back to back
    * var videoNode1 = ctx.video("video1.mp4");
    * videoNode1.play(0);
    * videoNode1.stop(10);
    * var videoNode2 = ctx.video("video2.mp4");
    * videoNode2.play(10);
    * videoNode2.stop(20);
    *
    * //Connect the nodes to the combine node. This will give a single connection representing the two videos which can
    * //be connected to other effects such as LUTs, chromakeyers, etc.
    * videoNode1.connect(trackNode);
    * videoNode2.connect(trackNode);
    *
    * //Don't do anything exciting, just connect it to the output.
    * trackNode.connect(ctx.destination);
    *
    */
    compositor(definition){
        let compositingNode = new CompositingNode(this._gl, this._renderGraph, definition);
        this._processingNodes.push(compositingNode);
        return compositingNode;
    }

    /**
    * @depricated
    */
    createCompositingNode(definition){
        this._depricate("Warning: createCompositingNode will be depricated in v1.0, please switch to using VideoContext.compositor()");
        return this.compositor(definition);
    }



    /**
    * Create a new transition node.
    *
    * Transistion nodes are a type of effect node which have parameters which can be changed as events on the timeline.
    *
    * For example a transition node which cross-fades between two videos could have a "mix" property which sets the
    * progress through the transistion. Rather than having to write your own code to adjust this property at specfic
    * points in time a transition node has a "transition" function which takes a startTime, stopTime, targetValue, and a
    * propertyName (which will be "mix"). This will linearly interpolate the property from the curernt value to
    * tragetValue between the startTime and stopTime.
    *
    * @param {Object} definition - this is an object defining the shaders, inputs, and properties of the transition node to create.
    * @return {TransitionNode} A new transition node created from the passed definition.
    * @example
    *
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement);
    *
    * //A simple cross-fade node definition which cross-fades between two videos based on the mix property.
    * var crossfadeDefinition = {
    *     vertexShader : "\
    *        attribute vec2 a_position;\
    *        attribute vec2 a_texCoord;\
    *        varying vec2 v_texCoord;\
    *        void main() {\
    *            gl_Position = vec4(vec2(2.0,2.0)*a_position-vec2(1.0, 1.0), 0.0, 1.0);\
    *            v_texCoord = a_texCoord;\
    *         }",
    *     fragmentShader : "\
    *         precision mediump float;\
    *         uniform sampler2D u_image_a;\
    *         uniform sampler2D u_image_b;\
    *         uniform float mix;\
    *         varying vec2 v_texCoord;\
    *         varying float v_mix;\
    *         void main(){\
    *             vec4 color_a = texture2D(u_image_a, v_texCoord);\
    *             vec4 color_b = texture2D(u_image_b, v_texCoord);\
    *             color_a[0] *= mix;\
    *             color_a[1] *= mix;\
    *             color_a[2] *= mix;\
    *             color_a[3] *= mix;\
    *             color_b[0] *= (1.0 - mix);\
    *             color_b[1] *= (1.0 - mix);\
    *             color_b[2] *= (1.0 - mix);\
    *             color_b[3] *= (1.0 - mix);\
    *             gl_FragColor = color_a + color_b;\
    *         }",
    *     properties:{
    *         "mix":{type:"uniform", value:0.0},
    *     },
    *     inputs:["u_image_a","u_image_b"]
    * };
    *
    * //Create the node, passing in the definition.
    * var transitionNode = videoCtx.transition(crossfadeDefinition);
    *
    * //create two videos which will overlap by two seconds
    * var videoNode1 = ctx.video("video1.mp4");
    * videoNode1.play(0);
    * videoNode1.stop(10);
    * var videoNode2 = ctx.video("video2.mp4");
    * videoNode2.play(8);
    * videoNode2.stop(18);
    *
    * //Connect the nodes to the transistion node.
    * videoNode1.connect(transitionNode);
    * videoNode2.connect(transitionNode);
    *
    * //Set-up a transition which happens at the crossover point of the playback of the two videos
    * transitionNode.transition(8,10,1.0,"mix");
    *
    * //Connect the transition node to the output
    * transitionNode.connect(ctx.destination);
    *
    * //start playback
    * ctx.play();
    */
    transition(definition){
        let transitionNode = new TransitionNode(this._gl, this._renderGraph, definition);
        this._processingNodes.push(transitionNode);
        return transitionNode;
    }

    /**
    * @depricated
    */
    createTransitionNode(definition){
        this._depricate("Warning: createTransitionNode will be depricated in v1.0, please switch to using VideoContext.transition()");
        return this.transition(definition);
    }




    _isStalled(){
        for (let i = 0; i < this._sourceNodes.length; i++) {
            let sourceNode = this._sourceNodes[i];
            if (!sourceNode._isReady()){
                return true;
            }
        }
        return false;
    }


    /**
    * This allows manual calling of the update loop of the videoContext.
    *
    * @param {Number} dt - The difference in seconds between this and the previous calling of update.
    * @example
    *
    * var canvasElement = document.getElementById("canvas");
    * var ctx = new VideoContext(canvasElement, undefined, {"manualUpdate" : true});
    *
    * var previousTime;
    * function update(time){
    *     if (previousTime === undefined) previousTime = time;
    *     var dt = (time - previousTime)/1000;
    *     ctx.update(dt);
    *     previousTime = time;
    *     requestAnimationFrame(update);
    * }
    * update();
    *
    */
    update(dt){
        this._update(dt);
    }


    _update(dt){
        //Remove any destroyed nodes
        this._sourceNodes = this._sourceNodes.filter(sourceNode=>{
            if (!sourceNode.destroyed) return sourceNode;
        });

        this._processingNodes = this._processingNodes.filter(processingNode=>{
            if (!processingNode.destroyed) return processingNode;
        });


        if (this._state === VideoContext.STATE.PLAYING || this._state === VideoContext.STATE.STALLED || this._state === VideoContext.STATE.PAUSED) {
            this._callCallbacks("update");

            if (this._state !== VideoContext.STATE.PAUSED){
                if (this._isStalled()){
                    this._callCallbacks("stalled");
                    this._state = VideoContext.STATE.STALLED;
                }else{
                    this._state = VideoContext.STATE.PLAYING;
                }
            }

            if(this._state === VideoContext.STATE.PLAYING){
                //Handle timeline callbacks.
                let activeCallbacks = new Map();
                for(let callback of this._timelineCallbacks){
                    if (callback.time >= this.currentTime && callback.time < (this._currentTime + dt * this._playbackRate)){
                        //group the callbacks by time
                        if(!activeCallbacks.has(callback.time)) activeCallbacks.set(callback.time, []);
                        activeCallbacks.get(callback.time).push(callback);
                    }
                }


                //Sort the groups of callbacks by the times of the groups
                let timeIntervals = Array.from(activeCallbacks.keys());
                timeIntervals.sort(function(a, b){
                    return a - b;
                });

                for (let t of timeIntervals){
                    let callbacks = activeCallbacks.get(t);
                    callbacks.sort(function(a,b){
                        return a.ordering - b.ordering;
                    });
                    for(let callback of callbacks){
                        callback.func();
                    }
                }

                this._currentTime += dt * this._playbackRate;
                if(this._currentTime > this.duration && this._endOnLastSourceEnd){
                    //Do an update od the sourcenodes in case anything in the "ended" callbacks modifes currentTime and sources haven't had a chance to stop.
                    for (let i = 0; i < this._sourceNodes.length; i++) {
                        this._sourceNodes[i]._update(this._currentTime);
                    }
                    this._state = VideoContext.STATE.ENDED;
                    this._callCallbacks("ended");
                }
            }

            let sourcesPlaying = false;

            for (let i = 0; i < this._sourceNodes.length; i++) {
                let sourceNode = this._sourceNodes[i];

                if(this._state === VideoContext.STATE.STALLED){
                    if (sourceNode._isReady() && sourceNode._state === SOURCENODESTATE.playing) sourceNode._pause();
                }
                if(this._state === VideoContext.STATE.PAUSED){
                    sourceNode._pause();
                }
                if(this._state === VideoContext.STATE.PLAYING){
                    sourceNode._play();
                }
                sourceNode._update(this._currentTime);
                if (sourceNode._state === SOURCENODESTATE.paused || sourceNode._state === SOURCENODESTATE.playing){
                    sourcesPlaying = true;
                }
            }


            if (sourcesPlaying !== this._sourcesPlaying && this._state === VideoContext.STATE.PLAYING){
                if (sourcesPlaying === true){
                    this._callCallbacks("content");
                }else{
                    this._callCallbacks("nocontent");
                }
                this._sourcesPlaying = sourcesPlaying;
            }


            /*
            * Itterate the directed acyclic graph using Khan's algorithm (KHAAAAAN!).
            *
            * This has highlighted a bunch of ineffencies in the rendergraph class about how its stores connections.
            * Mainly the fact that to get inputs for a node you have to iterate the full list of connections rather than
            * a node owning it's connections.
            * The trade off with changing this is making/removing connections becomes more costly performance wise, but
            * this is deffinately worth while because getting the connnections is a much more common operation.
            *
            * TL;DR Future matt - refactor this.
            *
            */
            let sortedNodes = [];
            let connections = this._renderGraph.connections.slice();
            let nodes = RenderGraph.getInputlessNodes(connections);


            while (nodes.length > 0) {
                let node = nodes.pop();
                sortedNodes.push(node);
                for (let edge of RenderGraph.outputEdgesFor(node, connections)){
                    let index = connections.indexOf(edge);
                    if (index > -1) connections.splice(index, 1);
                    if (RenderGraph.inputEdgesFor(edge.destination, connections).length === 0){
                        nodes.push(edge.destination);
                    }
                }
            }

            for (let node of sortedNodes){
                if (this._sourceNodes.indexOf(node) === -1){
                    node._update(this._currentTime);
                    node._render();
                }
            }
        }
    }

    /**
    * Destroy all nodes in the graph and reset the timeline. After calling this any created nodes will be unusable.
    */
    reset(){
        for (let callback of this._callbacks){
            this.unregisterCallback(callback);
        }
        for (let node of this._sourceNodes){
            node.destroy();
        }
        for (let node of this._processingNodes){
            node.destroy();
        }
        this._update(0);
        this._sourceNodes = [];
        this._processingNodes = [];
        this._timeline = [];
        this._currentTime = 0;
        this._state = VideoContext.STATE.PAUSED;
        this._playbackRate = 1.0;
        this._sourcesPlaying = undefined;
        this._callbacks.set("stalled", []);
        this._callbacks.set("update", []);
        this._callbacks.set("ended", []);
        this._callbacks.set("content", []);
        this._callbacks.set("nocontent", []);
        this._timelineCallbacks = [];
    }

    _depricate(msg){
        console.log(msg);
    }

    static get DEFINITIONS() {
        return DEFINITIONS;
    }

    /**
     * Get a JS Object containing the state of the VideoContext instance and all the created nodes.
     */
    snapshot () {
        return snapshot(this);
    }
}

//playing - all sources are active
//paused - all sources are paused
//stalled - one or more sources is unable to play
//ended - all sources have finished playing
//broken - the render graph is in a broken state
VideoContext.STATE = {};
VideoContext.STATE.PLAYING = 0;
VideoContext.STATE.PAUSED = 1;
VideoContext.STATE.STALLED = 2;
VideoContext.STATE.ENDED = 3;
VideoContext.STATE.BROKEN = 4;

VideoContext.visualiseVideoContextTimeline = visualiseVideoContextTimeline;
VideoContext.visualiseVideoContextGraph = visualiseVideoContextGraph;
VideoContext.createControlFormForNode = createControlFormForNode;
VideoContext.createSigmaGraphDataFromRenderGraph = createSigmaGraphDataFromRenderGraph;
VideoContext.exportToJSON = exportToJSON;
VideoContext.updateablesManager = updateablesManager;
VideoContext.importSimpleEDL = importSimpleEDL;
