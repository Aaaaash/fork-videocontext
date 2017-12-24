//Matthew Shotton, R&D User Experience,© BBC 2015
import SourceNode, { SOURCENODESTATE } from "./sourcenode.js";

class VideoNode extends SourceNode {
    /**
     * 初始化一个video节点实例
     * 这个类不能直接实例化，应该通过videocontext.video方法调用
     */

    /**
     * src: 视频原地址
     * gl: webgl绘图上下文
     * renderGraph: 渲染管理器RenderGraph类
     * currentTime：当前播放时间
     * globalPlaybackRate: 全局播放速度
     * sourceOffset: 播放起始时间点
     * preloadTime: 预加载时间
     * videoElementCache: video元素缓存
     * attributes： 其他属性
     */
    constructor(
        src,
        gl,
        renderGraph,
        currentTime,
        globalPlaybackRate = 1.0,
        sourceOffset = 0,
        preloadTime = 4,
        videoElementCache = undefined,
        attributes = {}
    ) {
        super(src, gl, renderGraph, currentTime);
        this._preloadTime = preloadTime;
        this._sourceOffset = sourceOffset;
        this._globalPlaybackRate = globalPlaybackRate;
        this._videoElementCache = videoElementCache;
        this._playbackRate = 1.0;
        this._volume = 1.0;
        this._playbackRateUpdated = true;
        this._attributes = attributes;
        this._loopElement = false;
        this._isElementPlaying = false;
        if (this._attributes.loop) {
            this._loopElement = this._attributes.loop;
        }
        this._displayName = "VideoNode";
    }

    // 设置播放速度
    set playbackRate(playbackRate) {
        this._playbackRate = playbackRate;
        this._playbackRateUpdated = true;
    }

    set stretchPaused(stretchPaused) {
        super.stretchPaused = stretchPaused;
        if (this._element) {
            if (this._stretchPaused) {
                this._element.pause();
            } else {
                if (this._state === SOURCENODESTATE.playing) {
                    this._element.play();
                }
            }
        }
    }

    get stretchPaused() {
        return this._stretchPaused;
    }

    get playbackRate() {
        return this._playbackRate;
    }

    get elementURL() {
        return this._elementURL;
    }

    set volume(volume) {
        this._volume = volume;
        if (this._element !== undefined) this._element.volume = this._volume;
    }

    _load() {
        super._load();
        if (this._element !== undefined) {
            for (var key in this._attributes) {
                this._element[key] = this._attributes[key];
            }

            // 判断视频是否就绪且不是正在跳转状态
            if (this._element.readyState > 3 && !this._element.seeking) {
                if (this._loopElement === false) {
                    if (
                        this._stopTime === Infinity ||
                        this._stopTime == undefined
                    ) {
                        this._stopTime =
                            this._startTime + this._element.duration;
                        this._triggerCallbacks("durationchange", this.duration);
                    }
                }
                if (this._ready !== true) {
                    this._triggerCallbacks("loaded");
                    this._playbackRateUpdated = true;
                }

                this._ready = true;
            } else {
                if (this._state !== SOURCENODESTATE.error) {
                    this._ready = false;
                }
            }
            return;
        }
        // 如果可以管理video元素生命周期，则从videoElementCache中获取一个可用的video缓存
        if (this._isResponsibleForElementLifeCycle) {
            if (this._videoElementCache) {
                this._element = this._videoElementCache.get();
            } else {
                // 如果没有videoElementCache 则创建一个video元素赋值给this._element
                this._element = document.createElement("video");
                this._element.setAttribute("crossorigin", "anonymous");
                this._element.setAttribute("webkit-playsinline", "");
                this._element.setAttribute("playsinline", "");
                this._playbackRateUpdated = true;
            }
            this._element.volume = this._volume;
            if (
                window.MediaStream !== undefined &&
                this._elementURL instanceof MediaStream
            ) {
                this._element.srcObject = this._elementURL;
            } else {
                this._element.src = this._elementURL;
            }

            for (let key in this._attributes) {
                this._element[key] = this._attributes[key];
            }
        }
        if (this._element) {
            let currentTimeOffset = 0;
            if (this._currentTime > this._startTime)
                currentTimeOffset = this._currentTime - this._startTime;
            this._element.currentTime = this._sourceOffset + currentTimeOffset;
            this._element.onerror = () => {
                if (this._element === undefined) return;
                console.debug("Error with element", this._element);
                this._state = SOURCENODESTATE.error;
                // 即使有错误，也应该将其设置为true，以便节点可以输出透明
                this._ready = true;
                this._triggerCallbacks("error");
            };
        } else {
            // 如果元素因任何原因不存在，则进入错误状态
            this._state = SOURCENODESTATE.error;
            this._ready = true;
            this._triggerCallbacks("error");
        }
    }

    // 卸载元素，删除所有属性
    _unload() {
        super._unload();
        if (
            this._isResponsibleForElementLifeCycle &&
            this._element !== undefined
        ) {
            this._element.src = "";
            this._element.srcObject = undefined;
            for (let key in this._attributes) {
                this._element.removeAttribute(key);
            }
            this._element = undefined;
            if (!this._videoElementCache) delete this._element;
        }
        this._ready = false;
        this._isElementPlaying = false;
    }

    // 跳转播放时间
    _seek(time) {
        super._seek(time);
        if (
            this.state === SOURCENODESTATE.playing ||
            this.state === SOURCENODESTATE.paused
        ) {
            if (this._element === undefined) this._load();
            let relativeTime =
                this._currentTime - this._startTime + this._sourceOffset;
            this._element.currentTime = relativeTime;
            this._ready = false;
        }
        if (
            (this._state === SOURCENODESTATE.sequenced ||
                this._state === SOURCENODESTATE.ended) &&
            this._element !== undefined
        ) {
            this._unload();
        }
    }

    /**
     * 更新视频
     * @param {number} 当前时间
     */
    _update(currentTime) {
        // 如果 super._update(currentTime) 返回false，则返回false
        super._update(currentTime);
        // 检查视频是否已经结束
        if (this._element !== undefined) {
            if (this._element.ended) {
                this._state = SOURCENODESTATE.ended;
                this._triggerCallbacks("ended");
            }
        }

        if (
            this._startTime - this._currentTime < this._preloadTime &&
            this._state !== SOURCENODESTATE.waiting &&
            this._state !== SOURCENODESTATE.ended
        )
            this._load();

        if (this._state === SOURCENODESTATE.playing) {
            if (this._playbackRateUpdated) {
                this._element.playbackRate =
                    this._globalPlaybackRate * this._playbackRate;
                this._playbackRateUpdated = false;
            }
            if (!this._isElementPlaying) {
                this._element.play();
                if (this._stretchPaused) {
                    this._element.pause();
                }
                this._isElementPlaying = true;
            }
            return true;
        } else if (this._state === SOURCENODESTATE.paused) {
            this._element.pause();
            this._isElementPlaying = false;
            return true;
        } else if (
            this._state === SOURCENODESTATE.ended &&
            this._element !== undefined
        ) {
            this._element.pause();
            if (this._isElementPlaying) {
                this._unload();
            }
            return false;
        }
    }

    // 清楚时间线的状态
    clearTimelineState() {
        super.clearTimelineState();
        if (this._element !== undefined) {
            this._element.pause();
            this._isElementPlaying = false;
        }
        this._unload();
    }

    // 销毁节点
    destroy() {
        if (this._element) this._element.pause();
        super.destroy();
    }
}

export default VideoNode;
