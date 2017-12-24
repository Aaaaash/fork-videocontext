function stripHash (url){
    if (url.port === "" || url.port === undefined){
        return `${url.protocol}//${url.hostname}${url.pathname}`;
    } else {
        return `${url.protocol}//${url.hostname}:${url.port}${url.pathname}`;
    }
}

class VideoElementCache {

    constructor(cache_size = 3) {
        this._elements = [];
        this._elementsInitialised = false;
        /**
         * 根据cache_size 初始化离屏video元素 缓存为this._elements数组
         */
        for (let i = 0; i < cache_size; i++) {
            let element = this._createElement();            
            this._elements.push(element);
        }
    }


    _createElement(){
        // 创建video元素
        let videoElement = document.createElement("video");
        videoElement.setAttribute("crossorigin", "anonymous");
        videoElement.setAttribute("webkit-playsinline", "");
        videoElement.setAttribute("playsinline", "");
        videoElement.src = "";
        return videoElement;
    }

    init(){
        /**
         * 如果还未init() 则给this._elements中的所有video调用play()
         */
        if (!this._elementsInitialised){
            for(let element of this._elements){
                try {
                    element.play().then(()=>{
                    }, (e)=>{
                        if (e.name !== "NotSupportedError")throw(e);
                    });
                } catch(e) {
                    //console.log(e.name);
                }
            }    
        }
        this._elementsInitialised = true;
    }

    get() {
        // 尝试并获得一个已经初始化的元素。
        for (let element of this._elements) {
            // 出于某种原因，未初始化的videoElement的src属性设置为windows href。 因此做下面的检查。
            if ((element.src === "" || element.src === undefined || element.src === stripHash(window.location)) && element.srcObject == null )return element;
        }
        // 如果不存在，则回退到创建新元素。
        console.debug("No available video element in the cache, creating a new one. This may break mobile, make your initial cache larger.");
        let element = this._createElement();
        this._elements.push(element);
        this._elementsInitialised = false;
        return element;
    }

    get length(){
        return this._elements.length;
    }

    get unused(){
        // 获取尚未使用的video元素
        let count = 0;
        for (let element of this._elements) {
            if ((element.src === "" || element.src === undefined || element.src === stripHash(window.location))  && element.srcObject == null )count += 1;
        }
        return count;
    }

}

export default VideoElementCache;