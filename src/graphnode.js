//Matthew Shotton, R&D User Experience,© BBC 2015
class GraphNode {
    /**
    * 所有源节点和处理节点的基类
    */
    constructor(gl, renderGraph, inputNames, limitConnections=false){
        this._renderGraph = renderGraph;
        this._limitConnections = limitConnections;
        this._inputNames = inputNames;
        this._destroyed = false;

        // 设置Webgl的输出纹理
        this._gl = gl;
        this._renderGraph = renderGraph;
        this._rendered =false;
        this._displayName = "GraphNode";
    }

    /**
    * 获取类名
    *
    * @return String A string of the class name.
    */  
    get displayName(){
        return this._displayName;
    }

    /**
    * 获取输入的名称列表
    *
    * @return {String[]} An array of the names of the inputs ot the node.
    */
    get inputNames(){
        return this._inputNames.slice();
    }

    /**
    * 可以连接到此节点的最大连接数。 如果没有限制，这将返回无穷大。
    *
    * @return {number} 可连接的节点最大数
    */
    get maximumConnections(){
        if (this._limitConnections === false) return Infinity;
        return this._inputNames.length;
    }

    /**
    * 获取输入的节点列表
    *
    * @return {GraphNode[]} An array of nodes which connect to this node.
    */
    get inputs(){
        let result = this._renderGraph.getInputsForNode(this);
        result = result.filter(function(n){return n !== undefined;});
        return result;
    }
    
    /**
    * 获取输出的节点列表
    *
    * @return {GraphNode[]} An array of nodes which this node connects to.
    */
    get outputs(){
        return this._renderGraph.getOutputsForNode(this);
    }

    /**
    * 获取节点是否已被销毁
    *
    * @return {boolean} A true/false value of whather the node has been destoryed or not.
    */
    get destroyed(){
        return this._destroyed;
    }


    /**
    * 连接一个节点到目标节点
    * 
    * @param {GraphNode} targetNode - the node to connect.
    * @param {(number| String)} [targetPort] - the port on the targetNode to connect to, this can be an index, a string identifier, or undefined (in which case the next available port will be connected to).
    * 
    */
    /**
     * 链接节点
     */
    connect(targetNode, targetPort){
        return (this._renderGraph.registerConnection(this, targetNode, targetPort));
    }
    
    /**
    * 从目标节点断开此节点。 如果目标节点未定义，则删除所有输出连接。
    *
    * @param {GraphNode} [targetNode] - the node to disconnect from. If undefined, disconnect from all nodes.
    *
    */
    disconnect(targetNode){
        if (targetNode === undefined){
            let toRemove = this._renderGraph.getOutputsForNode(this);
            toRemove.forEach((target) => this._renderGraph.unregisterConnection(this, target));
            if (toRemove.length > 0) return true;
            return false;
        }
        return this._renderGraph.unregisterConnection(this, targetNode);
    }

    /**
    * 销毁节点，从图形渲染类中删除
    */
    destroy(){
        this.disconnect();
        for (let input of this.inputs){
            input.disconnect(this);
        }
        this._destroyed = true;
    }
}

export default GraphNode;
