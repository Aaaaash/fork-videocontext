//Matthew Shotton, R&D User Experience,© BBC 2015
import SourceNode, { SOURCENODESTATE } from "./sourcenode.js";

class CanvasNode extends SourceNode {
    /**
     * 实例化一个canvas节点
     * 应该通过videocontext.canvas方法实例化
     */
    constructor(canvas, gl, renderGraph, currentTime, preloadTime = 4) {
        super(canvas, gl, renderGraph, currentTime);
        this._preloadTime = preloadTime;
        this._displayName = "CanvasNode";
    }

    _load() {
        super._load();
        this._ready = true;
        this._triggerCallbacks("loaded");
    }

    _unload() {
        super._unload();
        this._ready = false;
    }

    _seek(time) {
        super._seek(time);
        if (
            this.state === SOURCENODESTATE.playing ||
            this.state === SOURCENODESTATE.paused
        ) {
            if (this._element === undefined) this._load();
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

    _update(currentTime) {
        super._update(currentTime);
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

export default CanvasNode;
