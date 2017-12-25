//Matthew Shotton, R&D User Experience,© BBC 2015
import GraphNode from "../graphnode.js";
import { compileShader, createShaderProgram, createElementTexutre, updateTexture } from "../utils.js";
import { RenderException } from "../exceptions.js";

class ProcessingNode extends GraphNode{
    constructor(gl, renderGraph, definition, inputNames, limitConnections){
        super(gl, renderGraph, inputNames, limitConnections);
        this._vertexShader = compileShader(gl, definition.vertexShader, gl.VERTEX_SHADER);
        this._fragmentShader = compileShader(gl, definition.fragmentShader, gl.FRAGMENT_SHADER);
        this._definition = definition;
        this._properties = {}; // 缓存着色器属性
        // 复制着色器定义中的属性
        for(let propertyName in definition.properties){
            let propertyValue = definition.properties[propertyName].value;
            // 如果是数组就浅拷贝
            if(Object.prototype.toString.call(propertyValue) === "[object Array]"){
                propertyValue = definition.properties[propertyName].value.slice();
            }
            let propertyType = definition.properties[propertyName].type;
            this._properties[propertyName] = {type:propertyType, value:propertyValue};
        }

        this._inputTextureUnitMapping =[];
        this._maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
        this._boundTextureUnits = 0;
        this._parameterTextureCount = 0;
        this._inputTextureCount = 0;
        this._texture = createElementTexutre(gl);
        gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // 编译着色器
        this._program = createShaderProgram(gl, this._vertexShader, this._fragmentShader);

        // 创建一个帧缓冲区
        this._framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._texture,0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // 在这个对象上为传递的属性创建属性
        for (let propertyName in this._properties){
            Object.defineProperty(this, propertyName, {
                get:function(){return this._properties[propertyName].value;},
                set:function(passedValue){this._properties[propertyName].value = passedValue;}
            });
        }

        // 为任何纹理属性创建纹理
        for (let propertyName in this._properties){
            let propertyValue = this._properties[propertyName].value;
            if (propertyValue instanceof Image){
                this._properties[propertyName].texture = createElementTexutre(gl);
                this._properties[propertyName].texutreUnit = gl.TEXTURE0 + this._boundTextureUnits;
                this._boundTextureUnits += 1;
                this._parameterTextureCount +=1;
                if (this._boundTextureUnits > this._maxTextureUnits){
                    throw new RenderException("Trying to bind more than available textures units to shader");
                }
            }
        }

        // 计算输入纹理的纹理单位
        for(let inputName of definition.inputs){
            this._inputTextureUnitMapping.push({name:inputName, textureUnit:gl.TEXTURE0 + this._boundTextureUnits});
            this._boundTextureUnits += 1;
            this._inputTextureCount += 1;
            if (this._boundTextureUnits > this._maxTextureUnits){
                throw new RenderException("Trying to bind more than available textures units to shader");
            }
        }


        // 在编译的着色器中找到属性的位置
        for (let propertyName in this._properties){
            if (this._properties[propertyName].type === "uniform"){
                this._properties[propertyName].location = this._gl.getUniformLocation(this._program, propertyName);
            }
        }
        this._currentTimeLocation = this._gl.getUniformLocation(this._program, "currentTime");
        this._currentTime = 0;


        let positionLocation = gl.getAttribLocation(this._program, "a_position");
        let buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                1.0, 1.0,
                0.0, 1.0,
                1.0, 0.0,
                1.0, 0.0,
                0.0, 1.0,
                0.0, 0.0]),
            gl.STATIC_DRAW);
        let texCoordLocation = gl.getAttribLocation(this._program, "a_texCoord");
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
        this._displayName = "ProcessingNode";

    }

    /**
    * 将传递的值设为节点的属性
    * @param {string} name - 要修改的处理节点参数的名称
    * @param {Object} value - 值
    *
    * @example 示例
    * var ctx = new VideoContext();
    * var monoNode = ctx.effect(VideoContext.DEFINITIONS.MONOCHROME);
    * monoNode.setProperty("inputMix", [1.0,0.0,0.0]);
    */
    setProperty(name, value){
        this._properties[name].value = value;
    }

    /**
    * 通过属性名获取节点上属性的值
    * @param {string} name - 属性名
    *
    * @example 
    * var ctx = new VideoContext();
    * var monoNode = ctx.effect(VideoContext.DEFINITIONS.MONOCHROME);
    * console.log(monoNode.getProperty("inputMix"));
    * 
    */
    getProperty(name){
        return this._properties[name].value;
    }

    /**
    * 销毁节点
    */
    destroy(){
        super.destroy();
        for (let propertyName in this._properties){
            let propertyValue = this._properties[propertyName].value;
            if (propertyValue instanceof Image){
                this._gl.deleteTexture(this._properties[propertyName].texture);
                this._texture = undefined;
            }
        }
        // 销毁纹理
        this._gl.deleteTexture(this._texture);
        this._texture = undefined;
        // 分离着色器
        this._gl.detachShader(this._program, this._vertexShader);
        this._gl.detachShader(this._program, this._fragmentShader);
        // 删除着色器
        this._gl.deleteShader(this._vertexShader);
        this._gl.deleteShader(this._fragmentShader);
        // 删除着色器程序
        this._gl.deleteProgram(this._program);
        // 删除帧缓冲区
        this._gl.deleteFramebuffer(this._framebuffer);
    }

    _update(currentTime){
        this._currentTime = currentTime;
    }

    _seek(currentTime){
        this._currentTime = currentTime;
    }

    _render(){
        this._rendered = true;
        let gl = this._gl;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.useProgram(this._program);

        //upload the default uniforms
        gl.uniform1f(this._currentTimeLocation, parseFloat(this._currentTime));

        //upload/update the custom uniforms
        let textureOffset = 0;
        for (let propertyName in this._properties){
            let propertyValue = this._properties[propertyName].value;
            let propertyType = this._properties[propertyName].type;
            let propertyLocation = this._properties[propertyName].location;
            if (propertyType !== "uniform") continue;

            if (typeof propertyValue === "number"){
                gl.uniform1f(propertyLocation, propertyValue);
            }
            else if( Object.prototype.toString.call(propertyValue) === "[object Array]"){
                if(propertyValue.length === 1){
                    gl.uniform1fv(propertyLocation, propertyValue);
                } else if(propertyValue.length === 2){
                    gl.uniform2fv(propertyLocation, propertyValue);
                } else if(propertyValue.length === 3){
                    gl.uniform3fv(propertyLocation, propertyValue);
                } else if(propertyValue.length === 4){
                    gl.uniform4fv(propertyLocation, propertyValue);
                } else{
                    console.debug("Shader parameter", propertyName, "is too long an array:", propertyValue);
                }
            } else if(propertyValue instanceof Image){
                let texture =  this._properties[propertyName].texture;
                let textureUnit = this._properties[propertyName].texutreUnit;
                updateTexture(gl, texture, propertyValue);

                gl.activeTexture(textureUnit);
                gl.uniform1i(propertyLocation, textureOffset);
                textureOffset += 1;
                gl.bindTexture(gl.TEXTURE_2D, texture);
            }
            else{
                //TODO - add tests for textures
                /*gl.activeTexture(gl.TEXTURE0 + textureOffset);
                gl.uniform1i(parameterLoctation, textureOffset);
                gl.bindTexture(gl.TEXTURE_2D, textures[textureOffset-1]);*/
            }
        }

    }
}

export default ProcessingNode;
