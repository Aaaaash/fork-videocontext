function stripHash (url){
    if (url.port === "" || url.port === undefined){
        return `${url.protocol}//${url.hostname}${url.pathname}`;
    } else {
        return `${url.protocol}//${url.hostname}:${url.port}${url.pathname}`;
    }
}

class VideoElementCache {

    constructor(cache_size = 3) {
        debugger;
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
                    console.log(element);
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
        //Try and get an already intialised element.
        for (let element of this._elements) {
            // For some reason an uninitialised videoElement has its sr attribute set to the windows href. Hence the below check.
            if ((element.src === "" || element.src === undefined || element.src === stripHash(window.location)) && element.srcObject == null )return element;
        }
        //Fallback to creating a new element if non exists.
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
        let count = 0;
        for (let element of this._elements) {
            // For some reason an uninitialised videoElement has its sr attribute set to the windows href. Hence the below check.
            if ((element.src === "" || element.src === undefined || element.src === stripHash(window.location))  && element.srcObject == null )count += 1;
        }
        return count;
    }

}

export default VideoElementCache;