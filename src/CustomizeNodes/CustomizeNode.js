import GraphNode from "../graphnode.js";
import { compileShader, createShaderProgram, createElementTexutre } from "../utils.js";

class CustomizeNode extends GraphNode {
    constructor(gl, renderGraph, definition) {
        super(gl, renderGraph, [], true);
        this._vertexShader = compileShader(gl, definition.vertexShader, gl.VERTEX_SHADER);
        this._fragmentShader = compileShader(gl, definition.fragmentShader, gl.FRAGMENT_SHADER);
        this._definition = definition;
        this._properties = {};

        for(let propertyName in definition.properties){
            let propertyValue = definition.properties[propertyName].value;

            if(Object.prototype.toString.call(propertyValue) === "[object Array]"){
                propertyValue = definition.properties[propertyName].value.slice();
            }
            let propertyType = definition.properties[propertyName].type;
            this._properties[propertyName] = {type:propertyType, value:propertyValue};
        }
        
        // 最大纹理图像单元
        this._maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
        this._boundTextureUnits = 0;
        this._parameterTextureCount = 0;
        this._inputTextureCount = 0;
        this._texture = createElementTexutre(gl);
        gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // 链接着色器程序
        this._program = createShaderProgram(gl, this._vertexShader, this._fragmentShader);
    }
}

export default CustomizeNode;
