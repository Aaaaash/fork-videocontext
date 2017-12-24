//Matthew Shotton, R&D User Experience,© BBC 2015
import SourceNode, { SOURCENODESTATE } from "./sourcenode.js";

class ImageNode extends SourceNode {
    /**
     * 实例化一个图像节点
     * 这不应该被直接调用，而是通过videocontext.image方法实例化
     */
    constructor(
        src,
        gl,
        renderGraph,
        currentTime,
        preloadTime = 4,
        attributes = {}
    ) {
        super(src, gl, renderGraph, currentTime);
        this._preloadTime = preloadTime;
        this._attributes = attributes;
        this._textureUploaded = false;
        this._displayName = "ImageNode";
    }

    get elementURL() {
        return this._elementURL;
    }

    _load() {
        if (this._element !== undefined) {
            for (var key in this._attributes) {
                this._element[key] = this._attributes[key];
            }
            return;
        }
        if (this._isResponsibleForElementLifeCycle) {
            super._load();
            this._element = new Image();
            this._element.setAttribute("crossorigin", "anonymous");
            this._element.src = this._elementURL;
            this._element.onload = () => {
                this._ready = true;
                this._triggerCallbacks("loaded");
            };
            this._element.onerror = () => {
                console.error(
                    "ImageNode failed to load. url:",
                    this._elementURL
                );
            };

            for (let key in this._attributes) {
                this._element[key] = this._attributes[key];
            }
        }
        this._element.onerror = () => {
            console.debug("Error with element", this._element);
            this._state = SOURCENODESTATE.error;
            // 即使有错误，也应该将其设置为true，以便节点可以输出透明
            this._ready = true;
            this._triggerCallbacks("error");
        };
    }

    _unload() {
        super._unload();
        if (this._isResponsibleForElementLifeCycle) {
            this._element.src = "";
            this._element.onerror = undefined;
            this._element = undefined;
            delete this._element;
        }
        this._ready = false;
    }

    _seek(time) {
        super._seek(time);
        if (
            this.state === SOURCENODESTATE.playing ||
            this.state === SOURCENODESTATE.paused
        ) {
            if (this._element === undefined) this._load();
        }
        if (
            (this._state === SOURCENODESTATE.sequenced ||
                this._state === SOURCENODESTATE.ended) &&
            this._element !== undefined
        ) {
            this._unload();
        }
    }

    _update(currentTime) {
        if (this._textureUploaded) {
            super._update(currentTime, false);
        } else {
            super._update(currentTime);
        }

        if (
            this._startTime - this._currentTime < this._preloadTime &&
            this._state !== SOURCENODESTATE.waiting &&
            this._state !== SOURCENODESTATE.ended
        )
            this._load();

        if (this._state === SOURCENODESTATE.playing) {
            return true;
        } else if (this._state === SOURCENODESTATE.paused) {
            return true;
        } else if (
            this._state === SOURCENODESTATE.ended &&
            this._element !== undefined
        ) {
            this._unload();
            return false;
        }
    }
}

export default ImageNode;
