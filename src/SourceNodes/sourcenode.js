//Matthew Shotton, R&D User Experience,© BBC 2015
import { updateTexture, clearTexture, createElementTexutre } from "../utils.js";
import GraphNode from "../graphnode.js";

let STATE = {
    waiting: 0,
    sequenced: 1,
    playing: 2,
    paused: 3,
    ended: 4,
    error: 5
};

class SourceNode extends GraphNode {
    /**
     * 初始化一个SourceNode实例
     * 这是生成要传递到处理管道的介质的其他节点的基类
     * 参数为一个源数据的src，webgl对象，图形渲染对象，当前播放时间点
     */
    constructor(src, gl, renderGraph, currentTime) {
        // 调用父类的constructor方法并传递参数
        super(gl, renderGraph, [], true);
        this._element = undefined;
        this._elementURL = undefined;
        this._isResponsibleForElementLifeCycle = true;

        if (
            typeof src === "string" ||
            (window.MediaStream !== undefined && src instanceof MediaStream)
        ) {
            // 从传递的url或MediaStream中创建节点
            this._elementURL = src;
        } else {
            // 如果src是一个video对象，则由开发者自行管理video元素的生命周期，将src赋值给this._element
            this._element = src;
            this._isResponsibleForElementLifeCycle = false;
        }

        // 初始化属性
        this._state = STATE.waiting;
        this._currentTime = currentTime;
        this._startTime = NaN;
        this._stopTime = Infinity;
        this._ready = false;
        this._loadCalled = false;
        this._stretchPaused = false;
        // 创建一个webgl纹理
        this._texture = createElementTexutre(gl);
        // 为webgl对象初始化一个2d纹理图像
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            1,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array([0, 0, 0, 0])
        );
        this._callbacks = [];
        this._renderPaused = false;
        this._displayName = "SourceNode";
    }

    /**
     * 返回节点的状态
     * 0 - Waiting, start() 方法还未被调用
     * 1 - Sequenced, start() 已经被调用但还没有开始播放
     * 2 - Playing, 节点正在播放
     * 3 - Paused, 节点暂停播放
     * 4 - Ended, 播放结束
     *
     * @example 示例
     * var ctx = new VideoContext();
     * var videoNode = ctx.video('video.mp4');
     * console.log(videoNode.state); //will output 0 (for waiting)
     * videoNode.start(5);
     * console.log(videoNode.state); //will output 1 (for sequenced)
     * videoNode.stop(10);
     * ctx.play();
     * console.log(videoNode.state); //will output 2 (for playing)
     * ctx.paused();
     * console.log(videoNode.state); //will output 3 (for paused)
     */
    get state() {
        return this._state;
    }

    /**
     * 返回表示此源节点的底层DOM元素
     * Note: 如果使用url创建源节点而不是传入现有元素，那么将返回undefined，直到源节点预加载元素
     *
     * @return {Element} 底层DOM元素表示节点的媒体
     *
     * @example 示例
     * // 访问通过URL创建的VideoNode上的元素
     * var ctx = new VideoContext();
     * var videoNode = ctx.createVideoSourceNode('video.mp4');
     * videoNode.start(0);
     * videoNode.stop(5);
     * // 节点开始播放时，元素应该存在，因此将音量设置为0
     * videoNode.regsiterCallback("play", function(){videoNode.element.volume = 0;});
     */
    get element() {
        return this._element;
    }

    /**
     * 返回时间轴上节点的持续时间 如果没有开始时间设置将返回undefiend
     * 如果没有设置停止时间将返回无穷大
     *
     * @return {number} 时间轴上节点的持续时间
     *
     * @example 示例
     * var ctx = new VideoContext();
     * var videoNode = ctx.createVideoSourceNode('video.mp4');
     * videoNode.start(5);
     * videoNode.stop(10);
     * console.log(videoNode.duration); //will output 10
     */
    get duration() {
        if (isNaN(this._startTime)) return undefined;
        if (this._stopTime === Infinity) return Infinity;
        return this._stopTime - this._startTime;
    }

    set stretchPaused(stretchPaused) {
        this._stretchPaused = stretchPaused;
    }

    get stretchPaused() {
        return this._stretchPaused;
    }

    // 加载
    _load() {
        if (!this._loadCalled) {
            this._triggerCallbacks("load");
            this._loadCalled = true;
        }
    }
    // 卸载
    _unload() {
        this._triggerCallbacks("destroy");
        this._loadCalled = false;
    }

    /**
     * 注册这些事件之一的回调函数
     * “load”，“destroy”，“seek”，“pause”，“play”，“ended”，“durationchange”，“loaded”，“error”
     *
     * @param {String} type - 事件类型
     * @param {function} func - 回调函数
     *
     * @example 示例
     * var ctx = new VideoContext();
     * var videoNode = ctx.createVideoSourceNode('video.mp4');
     *
     * videoNode.registerCallback("load", function(){"video is loading"});
     * videoNode.registerCallback("play", function(){"video is playing"});
     * videoNode.registerCallback("ended", function(){"video has eneded"});
     *
     */
    registerCallback(type, func) {
        this._callbacks.push({ type: type, func: func });
    }

    /**
     * 注销回调函数
     *
     * @param {function} [func] - 需要注销的回调函数
     *
     * @example 示例
     * var ctx = new VideoContext();
     * var videoNode = ctx.createVideoSourceNode('video.mp4');
     *
     * videoNode.registerCallback("load", function(){"video is loading"});
     * videoNode.registerCallback("play", function(){"video is playing"});
     * videoNode.registerCallback("ended", function(){"video has eneded"});
     * videoNode.unregisterCallback(); // 注销所有回调函数
     *
     */
    unregisterCallback(func) {
        let toRemove = [];
        // 如果参数为undefined，则注销所有回调函数
        for (let callback of this._callbacks) {
            if (func === undefined) {
                toRemove.push(callback);
            } else if (callback.func === func) {
                toRemove.push(callback);
            }
        }
        for (let callback of toRemove) {
            let index = this._callbacks.indexOf(callback);
            this._callbacks.splice(index, 1);
        }
    }

    // 触发一个回调函数
    _triggerCallbacks(type, data) {
        for (let callback of this._callbacks) {
            if (callback.type === type) {
                if (data !== undefined) {
                    callback.func(this, data);
                } else {
                    callback.func(this);
                }
            }
        }
    }

    /**
     * 在VideoContext.currentTime+传递时间时开始播放。 如果通过的时间是负面的，将尽快播放
     *
     * @param {number} time - 播放时间
     * @return {boolean}
     */
    start(time) {
        if (this._state !== STATE.waiting) {
            console.debug(
                "SourceNode is has already been sequenced. Can't sequence twice."
            );
            return false;
        }

        this._startTime = this._currentTime + time;
        this._state = STATE.sequenced;
        return true;
    }

    /**
     * 在VideoContext的时间轴上绝对时间开始播放
     *
     * @param {number} time - 播放时间
     * @return {boolean}
     */
    startAt(time) {
        if (this._state !== STATE.waiting) {
            console.debug(
                "SourceNode is has already been sequenced. Can't sequence twice."
            );
            return false;
        }
        this._startTime = time;
        this._state = STATE.sequenced;
        return true;
    }

    get startTime() {
        return this._startTime;
    }

    /**
     * 在VideoContext.currentTime + 传递时间时停止播放。 如果通过的时间是负面的，将尽快停止
     *
     * @param {number} time - 停止时间
     * @return {boolean}
     */
    stop(time) {
        if (this._state === STATE.ended) {
            console.debug("SourceNode has already ended. Cannot call stop.");
            return false;
        } else if (this._state === STATE.waiting) {
            console.debug(
                "SourceNode must have start called before stop is called"
            );
            return false;
        }
        if (this._currentTime + time <= this._startTime) {
            console.debug(
                "SourceNode must have a stop time after it's start time, not before."
            );
            return false;
        }
        this._stopTime = this._currentTime + time;
        this._stretchPaused = false;
        this._triggerCallbacks("durationchange", this.duration);
        return true;
    }

    /**
     * 在VideoContext的时间轴上绝对时间停止播放
     *
     * @param {number} time - 停止时间
     * @return {boolean}
     */
    stopAt(time) {
        if (this._state === STATE.ended) {
            console.debug("SourceNode has already ended. Cannot call stop.");
            return false;
        } else if (this._state === STATE.waiting) {
            console.debug(
                "SourceNode must have start called before stop is called"
            );
            return false;
        }
        if (time <= this._startTime) {
            console.debug(
                "SourceNode must have a stop time after it's start time, not before."
            );
            return false;
        }
        this._stopTime = time;
        this._stretchPaused = false;
        this._triggerCallbacks("durationchange", this.duration);
        return true;
    }

    get stopTime() {
        return this._stopTime;
    }

    // 跳转时间点
    _seek(time) {
        this._renderPaused = false;

        this._triggerCallbacks("seek", time);

        if (this._state === STATE.waiting) return;
        if (time < this._startTime) {
            clearTexture(this._gl, this._texture);
            this._state = STATE.sequenced;
        }
        if (time >= this._startTime && this._state !== STATE.paused) {
            this._state = STATE.playing;
        }
        if (time >= this._stopTime) {
            clearTexture(this._gl, this._texture);
            this._triggerCallbacks("ended");
            this._state = STATE.ended;
        }
        // 更新当前时间
        this._currentTime = time;
    }

    // 暂停
    _pause() {
        if (
            this._state === STATE.playing ||
            (this._currentTime === 0 && this._startTime === 0)
        ) {
            this._triggerCallbacks("pause");
            this._state = STATE.paused;
            this._renderPaused = false;
        }
    }
    // 播放
    _play() {
        if (this._state === STATE.paused) {
            this._triggerCallbacks("play");
            this._state = STATE.playing;
        }
    }

    _isReady() {
        if (
            this._state === STATE.playing ||
            this._state === STATE.paused ||
            this._state === STATE.error
        ) {
            return this._ready;
        }
        return true;
    }

    /**
     *
     * @param {number} 当前时间
     * @param {boolean} 是否更新纹理图像
     */
    _update(currentTime, triggerTextureUpdate = true) {
        this._rendered = true;
        let timeDelta = currentTime - this._currentTime;

        // 更新当前时间
        this._currentTime = currentTime;

        // 更新状态
        if (
            this._state === STATE.waiting ||
            this._state === STATE.ended ||
            this._state === STATE.error
        )
            return false;

        this._triggerCallbacks("render", currentTime);

        if (currentTime < this._startTime) {
            clearTexture(this._gl, this._texture);
            this._state = STATE.sequenced;
        }

        if (
            currentTime >= this._startTime &&
            this._state !== STATE.paused &&
            this._state !== STATE.error
        ) {
            if (this._state !== STATE.playing) this._triggerCallbacks("play");
            this._state = STATE.playing;
        }

        if (currentTime >= this._stopTime) {
            clearTexture(this._gl, this._texture);
            this._triggerCallbacks("ended");
            this._state = STATE.ended;
        }

        // 更新源节点的纹理图像
        if (this._element === undefined) return true;

        if (!this._renderPaused && this._state === STATE.paused) {
            if (triggerTextureUpdate)
                updateTexture(this._gl, this._texture, this._element);
            this._renderPaused = true;
        }
        if (this._state === STATE.playing) {
            if (triggerTextureUpdate)
                updateTexture(this._gl, this._texture, this._element);
            if (this._stretchPaused) {
                this._stopTime += timeDelta;
            }
        }

        return true;
    }

    /**
     * 清除节点当前拥有的任何时间线状态，这将节点置于“等待”状态，就好像既没有启动也没有停止
     */
    clearTimelineState() {
        this._startTime = NaN;
        this._stopTime = Infinity;
        this._state = STATE.waiting;
    }

    /**
     * 销毁并清除这个节点
     */
    destroy() {
        this._unload();
        super.destroy();
        this.unregisterCallback();
        delete this._element;
        this._elementURL = undefined;
        this._state = STATE.waiting;
        this._currentTime = 0;
        this._startTime = NaN;
        this._stopTime = Infinity;
        this._ready = false;
        this._loadCalled = false;
        this._gl.deleteTexture(this._texture);
        this._texture = undefined;
    }
}

export { STATE as SOURCENODESTATE };

export default SourceNode;
