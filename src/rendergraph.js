//Matthew Shotton, R&D User Experience,© BBC 2015
import { ConnectException } from "./exceptions.js";

class RenderGraph {
    /**
     * 管理渲染图形
     */
    constructor() {
        this.connections = [];
    }

    /**
     * 获取一个通过节点连接到输出的节点列表
     *
     * @param {GraphNode} node - 获取输出的节点
     * @return {GraphNode[]} 通过节点连接到输出的节点列表
     */
    getOutputsForNode(node) {
        let results = [];
        this.connections.forEach(function(connection) {
            if (connection.source === node) {
                results.push(connection.destination);
            }
        });
        return results;
    }

    /**
     * 获取通过输入名称连接到给定节点的节点列表
     *
     * @param {GraphNode} node - 指定的输出
     * @return {Object[]} 表示节点和连接类型的对象数组.
     */
    getNamedInputsForNode(node) {
        let results = [];
        this.connections.forEach(function(connection) {
            if (connection.destination === node && connection.type === "name") {
                results.push(connection);
            }
        });
        return results;
    }

    /**
     * 获取通过z-index名称连接到给定节点的节点列表
     *
     * @param {GraphNode} node - 指定的输入节点
     * @return {Object[]} 表示节点和连接类型的对象数组，它们由节点的z-Index连接
     */
    getZIndexInputsForNode(node) {
        let results = [];
        this.connections.forEach(function(connection) {
            if (
                connection.destination === node &&
                connection.type === "zIndex"
            ) {
                results.push(connection);
            }
        });
        results.sort(function(a, b) {
            return a.zIndex - b.zIndex;
        });
        return results;
    }

    /**
     * 获取作为输入连接到给定节点的节点列表。 返回数组的长度总是等于该节点的输入数量，未定义代替未连接的任何输入。
     *
     * @param {GraphNode} node - 指定的输入节点
     * @return {GraphNode[]} 连接到节点的GraphNode数组
     */
    getInputsForNode(node) {
        let inputNames = node.inputNames;
        let results = [];
        let namedInputs = this.getNamedInputsForNode(node);
        let indexedInputs = this.getZIndexInputsForNode(node);

        if (node._limitConnections === true) {
            for (let i = 0; i < inputNames.length; i++) {
                results[i] = undefined;
            }

            for (let connection of namedInputs) {
                let index = inputNames.indexOf(connection.name);
                results[index] = connection.source;
            }
            let indexedInputsIndex = 0;
            for (let i = 0; i < results.length; i++) {
                if (
                    results[i] === undefined &&
                    indexedInputs[indexedInputsIndex] !== undefined
                ) {
                    results[i] = indexedInputs[indexedInputsIndex].source;
                    indexedInputsIndex += 1;
                }
            }
        } else {
            for (let connection of namedInputs) {
                results.push(connection.source);
            }
            for (let connection of indexedInputs) {
                results.push(connection.source);
            }
        }
        return results;
    }

    /**
     * 检查节点上的命名输入是否可用来连接。
     * @param {GraphNode} node - 需要检查的节点
     * @param {String} inputName - 命名
     */
    isInputAvailable(node, inputName) {
        if (node._inputNames.indexOf(inputName) === -1) return false;
        for (let connection of this.connections) {
            if (connection.type === "name") {
                if (
                    connection.destination === node &&
                    connection.name === inputName
                ) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * 注册两个节点之间的连接
     *
     * @param {GraphNode} sourceNode - 要连接的节点
     * @param {GraphNode} destinationNode - 被连接的节点 destinationNode最终将输出到画布上
     * @param {(String | number)} [target] - conenction的目标端口，这可能是一个字符串来指定一个特定的命名端口，一个通过索引来指定一个端口的数字，或者是undefined，在这种情况下，下一个可用的端口将被连接到.
     * @return {boolean} 如果连接成功则返回true，否则将抛出ConnectException异常
     */
    registerConnection(sourceNode, destinationNode, target) {
        // 检查destinationNode的输入量是否已达到最大数或destinationNode已经限制连接
        if (
            destinationNode.inputs.length >=
                destinationNode.inputNames.length &&
            destinationNode._limitConnections === true
        ) {
            throw new ConnectException(
                "Node has reached max number of inputs, can't connect"
            );
        }

        if (destinationNode._limitConnections === false) {
            // 检查是否已经连接，如果是的话发出警告
            const inputs = this.getInputsForNode(destinationNode);
            if (inputs.includes(sourceNode)) {
                console.debug(
                    "WARNING - node connected mutliple times, removing previous connection"
                );
                this.unregisterConnection(sourceNode, destinationNode);
            }
        }

        if (typeof target === "number") {
            // 目标是一个具体的
            this.connections.push({
                source: sourceNode,
                type: "zIndex",
                zIndex: target,
                destination: destinationNode
            });
        } else if (
            typeof target === "string" &&
            destinationNode._limitConnections
        ) {
            // 目标是一个指定的端口

            // 确保命名的端口是可用的
            if (this.isInputAvailable(destinationNode, target)) {
                this.connections.push({
                    source: sourceNode,
                    type: "name",
                    name: target,
                    destination: destinationNode
                });
            } else {
                throw new ConnectException(
                    "Port " + target + " is already connected to"
                );
            }
        } else {
            // 目标是未定义的，所以只是使它成为一个高zIndex
            let indexedConns = this.getZIndexInputsForNode(destinationNode);
            let index = 0;
            if (indexedConns.length > 0)
                index = indexedConns[indexedConns.length - 1].zIndex + 1;
            // 将连接保存进连接池
            this.connections.push({
                source: sourceNode,
                type: "zIndex",
                zIndex: index,
                destination: destinationNode
            });
        }
        return true;
    }

    /**
     * 删除两个节点的连接
     * @param {GraphNode} sourceNode - 要删除连接的节点.
     * @param {GraphNode} destinationNode - 被删除连接的节点
     * @return {boolean} 如果删除连接成功，将返回true;如果没有要删除的连接，则返回false。
     */
    unregisterConnection(sourceNode, destinationNode) {
        let toRemove = [];

        this.connections.forEach(function(connection) {
            if (
                connection.source === sourceNode &&
                connection.destination === destinationNode
            ) {
                toRemove.push(connection);
            }
        });

        if (toRemove.length === 0) return false;

        toRemove.forEach(removeNode => {
            let index = this.connections.indexOf(removeNode);
            this.connections.splice(index, 1);
        });

        return true;
    }

    static outputEdgesFor(node, connections) {
        let results = [];
        for (let conn of connections) {
            if (conn.source === node) {
                results.push(conn);
            }
        }
        return results;
    }

    static inputEdgesFor(node, connections) {
        let results = [];
        for (let conn of connections) {
            if (conn.destination === node) {
                results.push(conn);
            }
        }
        return results;
    }

    static getInputlessNodes(connections) {
        let inputLess = [];
        for (let conn of connections) {
            inputLess.push(conn.source);
        }
        for (let conn of connections) {
            let index = inputLess.indexOf(conn.destination);
            if (index !== -1) {
                inputLess.splice(index, 1);
            }
        }
        return inputLess;
    }
}

export default RenderGraph;
