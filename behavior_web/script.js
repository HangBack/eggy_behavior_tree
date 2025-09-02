
class BehaviorTreeEditor {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.canvasContainer = document.getElementById('canvas-container');
        this.connectionsSvg = document.getElementById('connections');
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.currentTool = 'select';
        this.connectingNode = null;
        this.nextNodeId = 1;
        this.isDragging = false;
        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1;
        this.dragGhost = null;
        this.tempConnection = null;

        // 历史记录管理
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;

        // 连接点高亮优化变量
        this.lastHighlightedConnectionKey = null;

        // 文件管理相关变量
        this.selectedFileItem = null;
        this.isRenamingFile = false;
        this.originalFileName = null;

        // 节点复制相关变量
        this.copiedNode = null;

        this.init();
    }

    init() {
        // 设置画布初始偏移，使(0,0)位置处于画布中心
        this.initializeCanvasCenter();

        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.setupAutoSave();

        // 加载上次使用的文件
        this.loadLastUsedFile();

        this.updateStatus();
        this.autoSave();
        this.setupPositionToggle();

        // 初始化历史记录 - 保存初始状态
        this.saveHistoryState('初始化');
        this.resetView();
    }

    setupPositionToggle() {
        const toggle = document.getElementById('position-toggle');
        const content = document.getElementById('position-content');
        const arrow = document.getElementById('position-arrow');

        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const isExpanded = content.style.display !== 'none';

            if (isExpanded) {
                // 收起
                content.style.display = 'none';
                arrow.style.transform = 'rotate(0deg)';
                arrow.textContent = '▶';
            } else {
                // 展开
                content.style.display = 'block';
                arrow.style.transform = 'rotate(90deg)';
                arrow.textContent = '▼';
            }
        });
    }

    initializeCanvasCenter() {
        // 简单地让画布左上角显示在屏幕中心附近
        const rect = this.canvasContainer.getBoundingClientRect();
        const containerWidth = rect.width || 800;
        const containerHeight = rect.height || 600;

        // 让画布的左上角(0,0)位置显示在屏幕中心
        this.offsetX = containerWidth / 2;
        this.offsetY = containerHeight / 2;

        this.updateCanvasTransform();
    }

    setupAutoSave() {
        // 监听属性输入变化，实时保存
        const inputs = ['node-name', 'node-function', 'node-policy', 'node-comment', 'repeater-count', 'timeout-duration', 'retry-count', 'cooldown-duration', 'wait-duration', 'subtree-reference'];
        inputs.forEach(id => {
            const element = document.getElementById(id);
            element.addEventListener('input', () => {
                if (this.selectedNode) {
                    this.autoSaveProperties();
                }
            });
        });

        // 监听装饰器类型选择变化
        document.getElementById('decorator-type').addEventListener('change', () => {
            if (this.selectedNode && this.selectedNode.type === 'DECORATOR') {
                const decoratorType = document.getElementById('decorator-type').value;
                this.selectedNode.decoratorType = decoratorType;
                this.handleDecoratorTypeChange();
            }
        });

        // 监听引用子树名称输入变化
        document.getElementById('subtree-reference').addEventListener('input', () => {
            if (this.selectedNode && this.selectedNode.type === 'DECORATOR' && this.selectedNode.decoratorType === 'SUBTREE_REF') {
                this.selectedNode.subtree = document.getElementById('subtree-reference').value;
                this.updateNodeDisplay();
                this.saveToStorage();

                // 延迟保存历史状态
                clearTimeout(this.subtreeReferenceSaveTimeout);
                this.subtreeReferenceSaveTimeout = setTimeout(() => {
                    this.saveHistoryState('修改引用子树名称');
                }, 1000);
            }
        });

        // 监听坐标输入变化
        const coordInputs = ['node-x', 'node-y'];
        coordInputs.forEach(id => {
            const element = document.getElementById(id);
            element.addEventListener('input', () => {
                if (this.selectedNode) {
                    this.updateNodePosition();
                }
            });

            // 聚焦时自动全选内容
            element.addEventListener('focus', () => {
                element.select();
            });

            // 点击时也触发全选（防止某些情况下focus事件不触发）
            element.addEventListener('click', () => {
                element.select();
            });
        });
    }

    autoSaveProperties() {
        if (!this.selectedNode) return;

        const oldName = this.selectedNode.name;
        const oldFunc = this.selectedNode.func;
        const oldPolicy = this.selectedNode.policy;
        const oldComment = this.selectedNode.comment;
        const oldRepeaterCount = this.selectedNode.repeaterCount;
        const oldTimeoutDuration = this.selectedNode.timeoutDuration;
        const oldRetryCount = this.selectedNode.retryCount;
        const oldCooldownDuration = this.selectedNode.cooldownDuration;
        const oldWaitDuration = this.selectedNode.waitDuration;
        const oldSubtree = this.selectedNode.subtree;

        const newName = document.getElementById('node-name').value;
        const newFunc = document.getElementById('node-function').value;
        const newPolicy = document.getElementById('node-policy').value;
        const newComment = document.getElementById('node-comment').value;
        const newRepeaterCount = document.getElementById('repeater-count').value;
        const newTimeoutDuration = document.getElementById('timeout-duration').value;
        const newRetryCount = document.getElementById('retry-count').value;
        const newCooldownDuration = document.getElementById('cooldown-duration').value;
        const newWaitDuration = document.getElementById('wait-duration').value;
        const newSubtree = document.getElementById('subtree-reference').value;

        // 检查是否有变更
        const hasChanges = oldName !== newName ||
            oldFunc !== newFunc ||
            oldPolicy !== newPolicy ||
            oldComment !== newComment ||
            oldRepeaterCount !== newRepeaterCount ||
            oldTimeoutDuration !== newTimeoutDuration ||
            oldRetryCount !== newRetryCount ||
            oldCooldownDuration !== newCooldownDuration ||
            oldWaitDuration !== newWaitDuration ||
            oldSubtree !== newSubtree;

        if (hasChanges) {
            this.selectedNode.name = newName;
            this.selectedNode.func = newFunc;
            this.selectedNode.policy = newPolicy;
            this.selectedNode.comment = newComment;

            // 保存装饰器特定属性
            if (this.selectedNode.type === 'DECORATOR') {
                this.selectedNode.repeaterCount = newRepeaterCount;
                this.selectedNode.timeoutDuration = newTimeoutDuration;
                this.selectedNode.retryCount = newRetryCount;
                this.selectedNode.cooldownDuration = newCooldownDuration;
                this.selectedNode.waitDuration = newWaitDuration;
                this.selectedNode.subtree = newSubtree;
            }

            this.updateNodeDisplay();
            this.validateAllNodes();

            // 检查黑板引用
            this.updateBlackboardReferences();

            this.saveToStorage();

            // 延迟保存历史状态，避免频繁输入时产生过多历史记录
            clearTimeout(this.propertySaveTimeout);
            this.propertySaveTimeout = setTimeout(() => {
                this.saveHistoryState('修改属性');
            }, 1000);

            this.showAutoSaveIndicator();
        }
    }

    updateNodePosition() {
        if (!this.selectedNode) return;

        const newX = parseFloat(document.getElementById('node-x').value);
        const newY = parseFloat(document.getElementById('node-y').value);

        // 验证输入值是否有效
        if (isNaN(newX) || isNaN(newY)) return;

        // 检查是否有位置变化
        if (this.selectedNode.x === newX && this.selectedNode.y === newY) return;

        // 限制在合理范围内（世界坐标系）
        const clampedX = Math.max(-2000, Math.min(1820, newX));
        const clampedY = Math.max(-2000, Math.min(1920, newY));

        // 更新节点位置
        this.selectedNode.x = clampedX;
        this.selectedNode.y = clampedY;

        // 如果位置被限制了，更新输入框显示
        if (clampedX !== newX) {
            document.getElementById('node-x').value = clampedX;
        }
        if (clampedY !== newY) {
            document.getElementById('node-y').value = clampedY;
        }

        // 更新节点DOM元素位置
        const nodeElement = document.getElementById(`node-${this.selectedNode.id}`);
        if (nodeElement) {
            nodeElement.style.left = `${this.selectedNode.x + 2000}px`;
            nodeElement.style.top = `${this.selectedNode.y + 2000}px`;
        }

        // 重新绘制连线
        this.drawConnections();

        // 保存更改
        this.saveToStorage();

        // 延迟保存历史状态
        clearTimeout(this.positionSaveTimeout);
        this.positionSaveTimeout = setTimeout(() => {
            this.saveHistoryState('修改节点位置');
        }, 800);

        this.showAutoSaveIndicator();
    }

    showAutoSaveIndicator() {
        const indicator = document.getElementById('auto-save');
        indicator.textContent = '属性已自动保存';
        setTimeout(() => indicator.textContent = '', 1500);
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 检查是否在任何输入框中输入内容
            const isInInputField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

            // 检查是否在文件管理模态框中
            const isFileManagerOpen = document.getElementById('file-manager-modal').classList.contains('show');

            // 文件管理器快捷键（只在文件管理器打开时生效）
            if (isFileManagerOpen) {
                // F2键重命名文件
                if (e.key === 'F2' && this.selectedFileItem) {
                    e.preventDefault();
                    this.renameSelectedFile();
                    return;
                }

                // Enter键切换到选中文件
                if (e.key === 'Enter' && this.selectedFileItem) {
                    e.preventDefault();
                    // 如果正在重命名，则确认重命名
                    if (this.isRenamingFile) {
                        this.confirmFileRename();
                    } else {
                        this.switchToSelectedFile();
                    }
                    return;
                }

                // Delete键删除文件
                if (e.key === 'Delete' && this.selectedFileItem) {
                    e.preventDefault();
                    this.deleteSelectedFile();
                    return;
                }

                // Escape键取消重命名
                if (e.key === 'Escape' && this.isRenamingFile) {
                    e.preventDefault();
                    this.cancelFileRename();
                    return;
                }

                // 如果在重命名状态下，阻止其他快捷键
                if (this.isRenamingFile) return;
            }

            // F2键重命名功能（节点重命名）
            if (e.key === 'F2' && this.selectedNode && !isFileManagerOpen) {
                e.preventDefault();
                this.startNodeRename();
                return;
            }

            // 如果在输入框中，禁用特定的快捷键：Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V
            if (isInInputField) {
                if (e.ctrlKey && ['z', 'y', 'c', 'v'].includes(e.key.toLowerCase())) {
                    // 在输入框中时，不阻止这些快捷键，让它们执行默认的输入框操作
                    return;
                }
            } else {
                // 非输入框状态下的全局快捷键

                // Ctrl+Z撤回
                if (e.ctrlKey && e.key === 'z') {
                    e.preventDefault();
                    this.undo();
                    return;
                }

                // Ctrl+Y恢复
                if (e.ctrlKey && e.key === 'y') {
                    e.preventDefault();
                    this.redo();
                    return;
                }

                // Ctrl+C复制节点
                if (e.ctrlKey && e.key === 'c' && this.selectedNode) {
                    e.preventDefault();
                    this.copyNode();
                    return;
                }

                // Ctrl+V粘贴节点
                if (e.ctrlKey && e.key === 'v' && this.copiedNode) {
                    e.preventDefault();
                    this.pasteNode();
                    return;
                }
            }

            // 其他快捷键只在非输入框状态下生效
            if (isInInputField) return;

            switch (e.key) {
                case '1':
                    this.selectToolByType('select');
                    break;
                case '2':
                    this.selectToolByType('connect');
                    break;
                case '3':
                    this.selectToolByType('delete');
                    break;
                case '4':
                    this.selectToolByType('disconnect');
                    break;
                case 'Delete':
                case 'Backspace':
                    if (this.selectedNode) {
                        this.deleteNode(this.selectedNode);
                        e.preventDefault();
                    }
                    break;
                case 'Escape':
                    this.resetConnectionMode();
                    this.selectNode(null);
                    break;
            }
        });
    }

    setupEventListeners() {
        document.querySelectorAll('.node-type').forEach(nodeType => {
            nodeType.addEventListener('mousedown', (e) => this.startNodeTypeDrag(e));
        });

        document.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleGlobalMouseUp(e));

        // 更新工具栏点击事件监听器 - 使用新的工具项
        document.querySelectorAll('.tool-item').forEach(tool => {
            tool.addEventListener('click', (e) => this.selectCanvasTool(e));
        });

        // 移除保存属性按钮的事件监听器
        document.getElementById('delete-node').addEventListener('click', () => this.deleteSelectedNode());

        document.getElementById('export-lua').addEventListener('click', () => this.exportLua());
        document.getElementById('export-json').addEventListener('click', () => this.exportJson());
        document.getElementById('import-json').addEventListener('click', () => this.importJson());
        document.getElementById('file-input').addEventListener('change', (e) => this.handleFileImport(e));

        // 预览功能事件监听器
        document.getElementById('preview-lua-btn').addEventListener('click', () => this.previewLua());
        document.getElementById('copy-code-btn').addEventListener('click', () => this.copyPreviewCode());
        document.getElementById('code-preview-close').addEventListener('click', () => this.closePreview());

        // 设置相关事件监听器
        document.getElementById('settings-btn').addEventListener('click', () => this.openSettings());
        document.getElementById('settings-close').addEventListener('click', () => this.closeSettings());
        document.getElementById('cancel-settings').addEventListener('click', () => this.closeSettings());
        document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());

        // 点击模态框背景关闭
        document.getElementById('settings-modal').addEventListener('click', (e) => {
            if (e.target.id === 'settings-modal') {
                this.closeSettings();
            }
        });

        document.getElementById('zoom-in').addEventListener('click', () => this.adjustZoom(0.1));
        document.getElementById('zoom-out').addEventListener('click', () => this.adjustZoom(-0.1));
        document.getElementById('reset-view').addEventListener('click', () => this.resetView());
        document.getElementById('center-nodes').addEventListener('click', () => this.centerViewOnNodes());

        this.canvas.addEventListener('mousedown', (e) => this.startCanvasDrag(e));
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvasContainer.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvasContainer.addEventListener('wheel', (e) => this.handleCanvasWheel(e));

        // 工具栏事件监听器
        document.getElementById('undo-btn').addEventListener('click', () => this.undo());
        document.getElementById('redo-btn').addEventListener('click', () => this.redo());
        document.getElementById('history-btn').addEventListener('click', () => this.toggleHistoryList());

        // 文件管理事件监听器
        document.getElementById('new-file-btn').addEventListener('click', () => this.openNewFileModal());
        document.getElementById('file-manager-btn').addEventListener('click', () => this.openFileManager());

        // 帮助模态框事件监听器
        document.getElementById('help-btn').addEventListener('click', () => this.openHelp());
        document.getElementById('help-close').addEventListener('click', () => this.closeHelp());

        // 文件管理模态框事件监听器
        document.getElementById('file-manager-close').addEventListener('click', () => this.closeFileManager());
        document.getElementById('refresh-files').addEventListener('click', () => this.refreshFileList());

        // 文件管理footer按钮事件监听器
        document.getElementById('rename-file-btn').addEventListener('click', () => this.renameSelectedFile());
        document.getElementById('switch-file-btn').addEventListener('click', () => this.switchToSelectedFile());
        document.getElementById('delete-file-btn').addEventListener('click', () => this.deleteSelectedFile());

        // 新建文件模态框事件监听器
        document.getElementById('new-file-close').addEventListener('click', () => this.closeNewFileModal());
        document.getElementById('cancel-new-file').addEventListener('click', () => this.closeNewFileModal());
        document.getElementById('create-file-btn').addEventListener('click', () => this.createNewFile());

        // 点击模态框背景关闭
        document.getElementById('file-manager-modal').addEventListener('click', (e) => {
            if (e.target.id === 'file-manager-modal') {
                this.closeFileManager();
            }
        });

        document.getElementById('new-file-modal').addEventListener('click', (e) => {
            if (e.target.id === 'new-file-modal') {
                this.closeNewFileModal();
            }
        });

        // 新建文件输入框回车键创建文件
        document.getElementById('new-file-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createNewFile();
            }
        });

        // 点击外部隐藏历史列表
        document.addEventListener('click', (e) => {
            const historyDropdown = document.querySelector('.history-dropdown');
            const historyList = document.getElementById('history-list');
            if (!historyDropdown.contains(e.target)) {
                historyList.classList.remove('show');
            }
        });
    }

    handleCanvasMouseMove(e) {
        if (this.currentTool === 'connect') {
            // 检查鼠标是否悬浮在节点上
            this.handleMouseOverNodes(e);

            // 如果已经选择了源连接点，显示虚线跟踪
            if (this.connectingNode && this.selectedFromPoint) {
                this.updateTempConnection(e);
            }
        }
    }

    handleMouseOverNodes(e) {
        // 获取鼠标位置
        const rect = this.canvasContainer.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - this.offsetX) / this.scale;
        const canvasY = (e.clientY - rect.top - this.offsetY) / this.scale;
        const worldX = canvasX - 2000;
        const worldY = canvasY - 2000;

        // 查找鼠标悬浮的节点
        const hoveredNode = this.getNodeAtWorldPosition(worldX, worldY);

        if (hoveredNode) {
            this.showConnectionPointsForNode(hoveredNode, e);
        } else {
            // 只有在没有连接中的节点时才隐藏连接点
            if (!this.connectingNode) {
                this.hideAllConnectionPoints();
                this.highlightedConnectionPoint = null;
            } else {
                // 连接模式下，只保留源节点的连接点显示
                this.showConnectionPoints(this.connectingNode);
                this.highlightedConnectionPoint = null;
            }
        }
    }

    handleCanvasWheel(e) {
        // 只有在按住Ctrl键时才进行缩放
        if (e.ctrlKey) {
            e.preventDefault();

            // 计算缩放增量
            const delta = -e.deltaY * 0.001;
            const newScale = Math.max(0.2, Math.min(3, this.scale + delta));

            if (newScale !== this.scale) {
                // 获取鼠标在画布容器中的位置
                const rect = this.canvasContainer.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // 计算缩放前鼠标指向的画布坐标
                const canvasX = (mouseX - this.offsetX) / this.scale;
                const canvasY = (mouseY - this.offsetY) / this.scale;

                // 更新缩放比例
                this.scale = newScale;

                // 调整偏移量，保持鼠标位置不变
                this.offsetX = mouseX - canvasX * this.scale;
                this.offsetY = mouseY - canvasY * this.scale;

                this.updateCanvasTransform();
                document.getElementById('zoom-level').textContent = `${Math.round(this.scale * 100)}%`;
            }
        }
    }

    updateTempConnection(e) {
        const rect = this.canvasContainer.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - this.offsetX) / this.scale;
        const canvasY = (e.clientY - rect.top - this.offsetY) / this.scale;

        // 将画布坐标转换为世界坐标
        const worldX = canvasX - 2000;
        const worldY = canvasY - 2000;

        // 检查是否悬停在节点上
        const hoveredNode = this.getNodeAtWorldPosition(worldX, worldY);

        // 计算起始点（源节点的连接点位置，使用画布物理坐标）
        const sourcePhysicalX = this.connectingNode.x + 2000;
        const sourcePhysicalY = this.connectingNode.y + 2000;

        // 获取源节点元素和尺寸
        const sourceNodeElement = document.getElementById(`node-${this.connectingNode.id}`);
        const sourceDimensions = this.getNodeDimensions(this.connectingNode, sourceNodeElement);

        const sourcePoint = this.getConnectionPoint(
            { x: sourcePhysicalX, y: sourcePhysicalY, id: this.connectingNode.id },
            this.selectedFromPoint || 'right'
        );

        let endX = canvasX;
        let endY = canvasY;
        let toPoint = 'left'; // 默认连接点

        if (hoveredNode && hoveredNode.id !== this.connectingNode.id) {
            // 使用当前高亮的连接点作为终点
            if (this.highlightedConnectionPoint && this.highlightedConnectionPoint.node.id === hoveredNode.id) {
                const targetPhysicalX = hoveredNode.x + 2000;
                const targetPhysicalY = hoveredNode.y + 2000;

                const endPoint = this.getConnectionPoint(
                    { x: targetPhysicalX, y: targetPhysicalY, id: hoveredNode.id },
                    this.highlightedConnectionPoint.side
                );
                endX = endPoint.x;
                endY = endPoint.y;
                toPoint = this.highlightedConnectionPoint.side;
            } else {
                // 连接到悬停节点的最优连接点
                const targetPhysicalX = hoveredNode.x + 2000;
                const targetPhysicalY = hoveredNode.y + 2000;
                const hoveredNodeElement = document.getElementById(`node-${hoveredNode.id}`);
                const targetDimensions = this.getNodeDimensions(hoveredNode, hoveredNodeElement);

                // 计算最优连接点
                const optimalPoint = this.findOptimalConnectionPoint(
                    { x: targetPhysicalX, y: targetPhysicalY, id: hoveredNode.id },
                    { x: sourcePoint.x, y: sourcePoint.y }
                );
                endX = optimalPoint.x;
                endY = optimalPoint.y;

                // 计算最优连接点方向
                toPoint = this.findOptimalConnectionSide(
                    { x: targetPhysicalX, y: targetPhysicalY, id: hoveredNode.id },
                    { x: sourcePoint.x, y: sourcePoint.y }
                );
            }
        }

        // 创建临时连接对象以传递连接点信息
        const tempConnection = {
            fromPoint: this.selectedFromPoint || 'right',
            toPoint: toPoint
        };

        this.drawTempConnection(sourcePoint.x, sourcePoint.y, endX, endY, tempConnection);
    }

    drawTempConnection(startX, startY, endX, endY, tempConnection = null) {
        // 移除之前的临时连线
        const existingTemp = this.connectionsSvg.querySelector('.temp-connection');
        if (existingTemp) {
            existingTemp.remove();
        }

        // 获取连线样式设置
        const connectionStyle = this.getConnectionStyle();

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d = '';

        if (connectionStyle === 'straight') {
            // 折线样式 - 有转折点的直线连接
            d = this.createPolylinePath(startX, startY, endX, endY, tempConnection || { fromPoint: 'right', toPoint: 'left' });
        } else {
            // 贝塞尔曲线样式（默认）
            let controlPoint1, controlPoint2;

            if (Math.abs(startX - endX) > Math.abs(startY - endY)) {
                // 水平连接
                const offsetX = Math.abs(startX - endX) * 0.4;
                controlPoint1 = { x: startX + (startX < endX ? offsetX : -offsetX), y: startY };
                controlPoint2 = { x: endX + (startX < endX ? -offsetX : offsetX), y: endY };
            } else {
                // 垂直连接
                const offsetY = Math.abs(startY - endY) * 0.4;
                controlPoint1 = { x: startX, y: startY + (startY < endY ? offsetY : -offsetY) };
                controlPoint2 = { x: endX, y: endY + (startY < endY ? -offsetY : offsetY) };
            }

            d = `M ${startX} ${startY} C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${endX} ${endY}`;
        }

        path.setAttribute('d', d);
        path.setAttribute('class', 'temp-connection');
        // 为临时连接添加虚线箭头
        path.setAttribute('marker-end', `url(#arrowhead-dashed-${tempConnection?.toPoint ?? "down"})`);

        this.connectionsSvg.appendChild(path);
    }

    getNodeAtPosition(x, y) {
        return this.nodes.find(node => {
            const nodeElement = document.getElementById(`node-${node.id}`);
            const nodeDimensions = this.getNodeDimensions(node, nodeElement);
            return x >= node.x && x <= node.x + nodeDimensions.width &&
                y >= node.y && y <= node.y + nodeDimensions.height
        });
    }

    getNodeAtWorldPosition(worldX, worldY) {
        return this.nodes.find(node => {
            const nodeElement = document.getElementById(`node-${node.id}`);
            const nodeDimensions = this.getNodeDimensions(node, nodeElement);
            const nodeWidth = nodeDimensions.width;
            const nodeHeight = nodeDimensions.height;
            return worldX >= node.x && worldX <= node.x + nodeWidth &&
                worldY >= node.y && worldY <= node.y + nodeHeight;
        });
    }

    selectToolByType(toolType) {
        this.currentTool = toolType;
        // 更新画布中的工具栏状态
        document.querySelectorAll('.tool-item').forEach(tool => tool.classList.remove('active'));
        document.getElementById(`${toolType}-tool`).classList.add('active');
        this.resetConnectionMode();
    }

    updateCanvasTransform() {
        const transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
        this.canvas.style.transform = transform;
        this.connectionsSvg.style.transform = transform;
    }

    startNodeDrag(e, node) {
        if (this.currentTool !== 'select') return;

        // 如果正在拖拽序号徽章，不要启动节点拖拽
        if (this.isDraggingOrderBadge) return;

        e.stopPropagation();
        this.draggingNode = node;

        // 检查是否按住了Ctrl键
        const isCtrlPressed = e.ctrlKey;

        // 如果按住Ctrl键，收集所有子节点和它们的相对位置
        this.draggingNodeGroup = [node]; // 至少包含主节点
        this.nodeOffsets = {}; // 存储每个节点相对于主节点的偏移量

        if (isCtrlPressed) {
            this.draggingNodeGroup = this.getAllDescendants(node);
            // 计算每个节点相对于主节点的偏移量
            this.draggingNodeGroup.forEach(childNode => {
                this.nodeOffsets[childNode.id] = {
                    x: childNode.x - node.x,
                    y: childNode.y - node.y
                };
            });
        } else {
            // 不按Ctrl键时，只移动主节点
            this.nodeOffsets[node.id] = { x: 0, y: 0 };
        }

        const rect = this.canvasContainer.getBoundingClientRect();
        // 计算鼠标在节点内的相对偏移（基于画布物理坐标）
        this.dragOffsetX = (e.clientX - rect.left - this.offsetX) / this.scale - (node.x + 2000);
        this.dragOffsetY = (e.clientY - rect.top - this.offsetY) / this.scale - (node.y + 2000);

        // 为所有拖动的节点添加拖动样式
        this.draggingNodeGroup.forEach(dragNode => {
            const nodeElement = document.getElementById(`node-${dragNode.id}`);
            if (nodeElement) {
                nodeElement.classList.add('dragging');
            }
        });

        // ⭐ 显示垃圾桶删除区域
        this.showTrashZone();
    }

    dragNode(e) {
        if (!this.draggingNode) return;

        const rect = this.canvasContainer.getBoundingClientRect();
        // 计算鼠标的画布物理坐标
        const mouseCanvasPhysicalX = (e.clientX - rect.left - this.offsetX) / this.scale;
        const mouseCanvasPhysicalY = (e.clientY - rect.top - this.offsetY) / this.scale;

        // 计算主节点的新画布物理位置
        const newCanvasPhysicalX = mouseCanvasPhysicalX - this.dragOffsetX;
        const newCanvasPhysicalY = mouseCanvasPhysicalY - this.dragOffsetY;

        // 转换为世界坐标
        const newWorldX = newCanvasPhysicalX - 2000;
        const newWorldY = newCanvasPhysicalY - 2000;

        // 限制主节点在合理范围内
        const clampedX = Math.max(-2000, Math.min(1820, newWorldX));
        const clampedY = Math.max(-2000, Math.min(1920, newWorldY));

        // 计算实际移动量（考虑边界限制）
        const deltaX = clampedX - this.draggingNode.x;
        const deltaY = clampedY - this.draggingNode.y;

        // 移动所有拖动组中的节点
        this.draggingNodeGroup.forEach(dragNode => {
            const targetX = dragNode.x + deltaX;
            const targetY = dragNode.y + deltaY;

            // 应用边界限制到每个节点
            dragNode.x = Math.max(-2000, Math.min(1820, targetX));
            dragNode.y = Math.max(-2000, Math.min(1920, targetY));

            // 更新节点DOM位置
            const nodeElement = document.getElementById(`node-${dragNode.id}`);
            if (nodeElement) {
                nodeElement.style.left = `${dragNode.x + 2000}px`;
                nodeElement.style.top = `${dragNode.y + 2000}px`;
            }
        });

        // ⭐ 检查鼠标是否悬浮在垃圾桶区域上
        this.checkTrashZoneHover(e);

        this.drawConnections();
    }

    // 获取节点的所有子孙节点（递归获取所有后代）
    getAllDescendants(node) {
        const descendants = [node]; // 包含节点自身
        const visited = new Set([node.id]); // 防止循环引用

        const collectChildren = (parentNode) => {
            // 获取当前节点的所有子节点
            const childConnections = this.connections.filter(conn => conn.from === parentNode.id);

            childConnections.forEach(conn => {
                const childNode = this.nodes.find(n => n.id === conn.to);
                if (childNode && !visited.has(childNode.id)) {
                    visited.add(childNode.id);
                    descendants.push(childNode);
                    // 递归收集子节点的后代
                    collectChildren(childNode);
                }
            });
        };

        collectChildren(node);
        return descendants;
    }

    endNodeDrag() {
        if (!this.draggingNode) return;

        // 移除所有拖动节点的拖动样式
        if (this.draggingNodeGroup) {
            this.draggingNodeGroup.forEach(dragNode => {
                const nodeElement = document.getElementById(`node-${dragNode.id}`);
                if (nodeElement) {
                    nodeElement.classList.remove('dragging');
                }
            });
        } else {
            // 兼容旧版本：只有主节点
            const nodeElement = document.getElementById(`node-${this.draggingNode.id}`);
            if (nodeElement) {
                nodeElement.classList.remove('dragging');
            }
        }

        // 清空拖动状态
        this.draggingNode = null;
        this.draggingNodeGroup = null;
        this.nodeOffsets = null;

        this.saveToStorage();

        // ⭐ 隐藏垃圾桶删除区域
        this.hideTrashZone();

        // 节点移动后保存历史状态
        this.saveHistoryState('移动节点');
    }

    startNodeTypeDrag(e) {
        e.preventDefault();
        const nodeType = e.currentTarget;
        const nodeTypeValue = nodeType.getAttribute('data-type');

        nodeType.classList.add('dragging');

        this.dragGhost = document.createElement('div');
        this.dragGhost.className = 'drag-ghost';
        this.dragGhost.innerHTML = `
            <div class="node-header">
                <div class="node-title">${nodeTypeValue}节点</div>
                <div class="node-type-tag">${nodeTypeValue}</div>
            </div>
        `;

        document.body.appendChild(this.dragGhost);
        this.currentDragType = nodeTypeValue;
        this.isDraggingNodeType = true;
        this.updateDragGhost(e);
    }

    handleGlobalMouseMove(e) {
        if (this.isDraggingNodeType && this.dragGhost) {
            this.updateDragGhost(e);
            const rect = this.canvasContainer.getBoundingClientRect();
            const isOverCanvas = e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom;

            if (isOverCanvas) {
                this.canvasContainer.classList.add('drag-over');
            } else {
                this.canvasContainer.classList.remove('drag-over');
            }
        } else if (this.isDragging && this.currentTool === 'select') {
            this.dragCanvas(e);
        } else if (this.draggingNode) {
            this.dragNode(e);
        }
    }

    handleGlobalMouseUp(e) {
        if (this.isDraggingNodeType) {
            this.endNodeTypeDrag(e);
        } else if (this.draggingNode) {
            // ⭐ 检查是否在垃圾桶区域释放
            const trashZone = document.getElementById('trash-zone');
            const rect = trashZone.getBoundingClientRect();
            const isOverTrashZone = trashZone.classList.contains('show') &&
                e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom;

            if (isOverTrashZone) {
                // 在垃圾桶区域释放，删除节点
                const nodeToDelete = this.draggingNode;
                this.draggingNode = null;
                this.hideTrashZone();
                this.deleteNode(nodeToDelete);
                this.showNotification(`节点 "${nodeToDelete.name}" 已删除`);
            } else {
                // 正常结束拖拽
                this.endNodeDrag();
            }
        } else if (this.isDragging) {
            this.endCanvasDrag();
        }
    }

    updateDragGhost(e) {
        if (this.dragGhost) {
            this.dragGhost.style.left = `${e.clientX + 10}px`;
            this.dragGhost.style.top = `${e.clientY + 10}px`;
        }
    }

    endNodeTypeDrag(e) {
        if (!this.isDraggingNodeType) return;

        document.querySelectorAll('.node-type').forEach(nt => nt.classList.remove('dragging'));
        this.canvasContainer.classList.remove('drag-over');

        if (this.dragGhost) {
            document.body.removeChild(this.dragGhost);
            this.dragGhost = null;
        }

        const rect = this.canvasContainer.getBoundingClientRect();
        const isOverCanvas = e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom;

        if (isOverCanvas && this.currentDragType) {
            // 直接转换屏幕坐标到画布坐标（0, 0）到（4000, 4000）
            const canvasX = (e.clientX - rect.left - this.offsetX) / this.scale;
            const canvasY = (e.clientY - rect.top - this.offsetY) / this.scale;

            this.createNode(this.currentDragType, canvasX, canvasY);
        }

        this.isDraggingNodeType = false;
        this.currentDragType = null;
    }

    getTypeChineseName(type) {
        const typeNames = {
            'SEQUENCE': '顺序节点',
            'FALLBACK': '选择节点',
            'PARALLEL': '并行节点',
            'CONDITION': '条件节点',
            'ACTION': '行为节点',
            'DECORATOR': '装饰节点',
            'BLACKBOARD': '黑板节点',
            'SUBTREE': '子树节点',
            'WAIT': '等待节点',
        };
        return typeNames[type] || `${type}节点`;
    }

    createNode(type, x, y, name = '') {
        // 将画布物理坐标转换为世界坐标(-2000, -2000)到(2000, 2000)
        const worldX = x - 2000;
        const worldY = y - 2000;

        const node = {
            id: this.nextNodeId++,
            type: type,
            name: name || this.getTypeChineseName(type),
            x: Math.max(-2000, Math.min(2000 - 180, worldX)), // 世界坐标限制
            y: Math.max(-2000, Math.min(2000 - 80, worldY)),
            func: '',
            policy: '',
            comment: ''
        };

        // 为条件节点和行为节点初始化参数数组
        if (['CONDITION', 'ACTION'].includes(type)) {
            node.params = [];
        }

        const nodeElement = this.createNodeElement(node);
        this.canvas.appendChild(nodeElement);
        this.nodes.push(node);

        this.updateStatus();
        this.validateAllNodes();
        this.saveToStorage();

        // 创建节点后保存历史状态
        this.saveHistoryState('创建节点');
        this.showNotification('节点创建成功');
        return node;
    }

    createNodeElement(node) {
        const nodeElement = document.createElement('div');
        nodeElement.className = 'node';
        nodeElement.id = `node-${node.id}`;
        nodeElement.setAttribute('data-type', node.type);
        // 将世界坐标(-2000, -2000)到(2000, 2000)映射到画布坐标(0, 0)到(4000, 4000)
        nodeElement.style.left = `${node.x + 2000}px`;
        nodeElement.style.top = `${node.y + 2000}px`;
        nodeElement.setAttribute('data-id', node.id);

        nodeElement.innerHTML = this.generateNodeHTML(node);

        nodeElement.addEventListener('click', (e) => this.handleNodeClick(e, node));
        nodeElement.addEventListener('mousedown', (e) => this.startNodeDrag(e, node));
        nodeElement.addEventListener('mouseenter', (e) => this.handleNodeMouseEnter(e, node));
        nodeElement.addEventListener('mouseleave', (e) => this.handleNodeMouseLeave(e, node));

        // 添加序号拖拽事件监听器
        this.setupChildOrderDragListeners(nodeElement, node);
        this.setupNodeOrderBadgeDragListeners(nodeElement, node);

        // 为黑板节点设置按钮事件
        if (node.type === 'BLACKBOARD') {
            this.setupBlackboardEvents(nodeElement, node);
        }

        return nodeElement;
    }

    validateAllNodes() {
        this.nodes.forEach(node => this.validateNode(node));
        // 验证子树节点重名
        this.validateSubtreeNames();
    }

    validateNode(node) {
        const nodeElement = document.getElementById(`node-${node.id}`);
        if (!nodeElement) return;

        let hasError = false;

        if (['CONDITION', 'ACTION'].includes(node.type) && !node.func) {
            hasError = true;
        }

        if (node.type === 'PARALLEL' && !node.policy) {
            hasError = true;
        }

        const hasChildren = this.connections.some(conn => conn.from === node.id);

        // 对装饰器节点特殊处理
        if (node.type === 'DECORATOR') {
            if (node.decoratorType === 'SUBTREE_REF') {
                // 引用子树类型：不需要子节点，但需要引用子树名称
                if (!node.subtree || !node.subtree.trim()) {
                    hasError = true;
                }
            } else if (node.decoratorType === 'WAIT') {
                if (!node.waitDuration || !node.waitDuration.trim()) {
                    hasError = true;
                }
            } else {
                // 其他装饰器类型：需要子节点
                if (!hasChildren) {
                    hasError = true;
                }
            }
        } else if (['SEQUENCE', 'FALLBACK', 'PARALLEL', 'SUBTREE'].includes(node.type) && !hasChildren) {
            hasError = true;
        }

        if (hasError) {
            nodeElement.classList.add('error');
        } else {
            nodeElement.classList.remove('error');
        }
    }

    // 验证子树节点名称是否重名
    validateSubtreeNames() {
        // 收集所有子树节点的名称
        const subtreeNames = {};

        // 遍历所有子树节点，收集名称并检查重复
        this.nodes.forEach(node => {
            if (node.type === 'SUBTREE') {
                const name = node.name ? node.name.trim() : '';
                if (name) {
                    if (!subtreeNames[name]) {
                        subtreeNames[name] = [];
                    }
                    subtreeNames[name].push(node);
                }
            }
        });

        // 清除所有子树节点的重名错误标记
        this.nodes.forEach(node => {
            if (node.type === 'SUBTREE') {
                const nodeElement = document.getElementById(`node-${node.id}`);
                if (nodeElement) {
                    nodeElement.classList.remove('subtree-name-duplicate');
                }
            }
        });

        // 标记重名的子树节点
        Object.keys(subtreeNames).forEach(name => {
            const nodesWithSameName = subtreeNames[name];
            if (nodesWithSameName.length > 1) {
                // 这个名称有多个子树节点使用，标记为重名错误
                nodesWithSameName.forEach(node => {
                    const nodeElement = document.getElementById(`node-${node.id}`);
                    if (nodeElement) {
                        nodeElement.classList.add('error', 'subtree-name-duplicate');
                        // 添加提示信息
                        nodeElement.title = `子树名称 "${name}" 重复，请修改为唯一名称`;
                    }
                });
            }
        });
    }

    generateNodeHTML(node) {
        let content = '';
        if (node.type === 'DECORATOR' && node.decoratorType === 'SUBTREE_REF') {
            // 引用子树装饰器显示引用的子树名称
            const subtreeRef = node.subtree || '未设置';
            content = `<p>引用子树: ${subtreeRef}</p>`;
        } else if (['SEQUENCE', 'FALLBACK', 'PARALLEL'].includes(node.type) ||
            (node.type === 'DECORATOR' && node.decoratorType !== 'SUBTREE_REF')) {
            // 其他需要显示子节点数量的节点类型
            const childCount = this.getChildCount(node.id);
            content = `<p>子节点: ${childCount}</p>`;
        } else if (['CONDITION', 'ACTION'].includes(node.type)) {
            content = `<p>函数: ${node.func || '未设置'}</p>`;
        } else if (['BLACKBOARD'].includes(node.type)) {
            content = `
                <div class="blackboard-content">
                    <div class="blackboard-header">
                        <span>数据字段</span>
                        <button class="add-field-btn" title="添加字段">+</button>
                    </div>
                    <div class="blackboard-fields">
                        ${(node.fields || []).map((field, index) => `
                            <div class="field-item" data-index="${index}">
                                <input type="text" class="field-key" value="${field.key}" placeholder="键名">
                                <input type="text" class="field-value" value="${field.value}" placeholder="值">
                                <input type="text" class="field-comment" value="${field.comment || ''}" placeholder="备注说明">
                                <button class="remove-field-btn" title="删除字段">×</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // 获取该节点在父节点中的序号
        const orderBadge = this.getNodeOrderBadge(node.id);

        // 获取显示标签
        let displayTag = this.getTypeChineseName(node.type);
        if (node.type === 'DECORATOR' && node.decoratorType) {
            const decoratorNames = {
                'INVERTER': '反转器',
                'REPEATER': '重复器',
                'TIMEOUT': '超时器',
                'RETRY': '重试器',
                'COOLDOWN': '冷却器',
                'WAIT': '等待器',
                'ONCE': '单发器',
                'ALWAYS_SUCCESS': '总是成功',
                'ALWAYS_FAILURE': '总是失败',
                'UNTIL_SUCCESS': '直到成功',
                'UNTIL_FAILURE': '直到失败',
                'SUBTREE_REF': '引用子树',
                'CONDITION_INTERRUPT': '条件中断节点',
            };
            displayTag = decoratorNames[node.decoratorType] || '装饰节点';
        }

        return `
            <div class="node-header">
                <div class="node-title">${node.name}</div>
                <div class="node-type-tag">${displayTag}</div>
            </div>
            <div class="node-content">${content}</div>
            ${orderBadge}
        `;
    }

    getChildCount(nodeId) {
        return this.connections.filter(conn => conn.from === nodeId).length;
    }

    handleNodeClick(e, node) {
        e.stopPropagation();

        if (this.currentTool === 'connect') {
            this.handleConnection(node);
        } else if (this.currentTool === 'delete') {
            this.deleteNode(node);
        } else if (this.currentTool === 'disconnect') {
            this.handleDisconnection(node);
        } else {
            this.selectNode(node);
        }
    }

    handleNodeMouseEnter(e, node) {
        if (this.currentTool !== 'connect') return;

        // 如果已经选择了源节点的连接点，绘制虚线到鼠标位置
        if (this.connectingNode && this.selectedFromPoint) {
            this.startTempConnectionTracking(node);
        }
    }

    handleNodeMouseLeave(e, node) {
        if (this.currentTool !== 'connect') return;

        // 清除自动选择状态
        this.lastSelectedConnectionKey = null;
        this.autoSelectedConnectionPoint = null;

        // ⭐ 清除连接点高亮优化变量
        this.lastHighlightedConnectionKey = null;

        // 如果不是连接中的节点，隐藏连接点
        if (!this.connectingNode || this.connectingNode.id !== node.id) {
            this.hideAllConnectionPoints();
        }

        // 停止临时连线追踪
        this.stopTempConnectionTracking();
    }

    startTempConnectionTracking(targetNode) {
        this.tempConnectionTarget = targetNode;
        // 在鼠标移动时更新临时连线
        this.trackingTempConnection = true;
    }

    stopTempConnectionTracking() {
        this.tempConnectionTarget = null;
        this.trackingTempConnection = false;
        // 移除临时连线
        const tempConnection = this.connectionsSvg.querySelector('.temp-connection');
        if (tempConnection) {
            tempConnection.remove();
        }
    }

    isMouseOverConnectionPoints() {
        return document.querySelector('.connection-point:hover') !== null;
    }

    isMouseOverNode(node) {
        const nodeElement = document.getElementById(`node-${node.id}`);
        return nodeElement && nodeElement.matches(':hover');
    }

    handleConnection(node) {
        if (!this.connectingNode) {
            // 第一步：选择源节点
            this.connectingNode = node;

            // 使用当前高亮的连接点，如果没有则使用默认的右侧连接点
            this.selectedFromPoint = this.highlightedConnectionPoint &&
                this.highlightedConnectionPoint.node.id === node.id ?
                this.highlightedConnectionPoint.side : 'right';

            // 显示连接点并高亮源节点
            this.showConnectionPoints(node);
            const nodeElement = document.getElementById(`node-${node.id}`);
            nodeElement.classList.add('connecting');

            this.showNotification('已选择源节点，请点击目标节点');
        } else if (this.connectingNode.id !== node.id) {
            // 第二步：选择目标节点，完成连接

            // 确保目标节点显示连接点并更新高亮状态
            this.showConnectionPoints(node);

            // 获取最优的目标连接点
            let selectedToPoint = 'left'; // 默认左侧

            // 如果有高亮的连接点且属于目标节点，使用它
            if (this.highlightedConnectionPoint && this.highlightedConnectionPoint.node.id === node.id) {
                selectedToPoint = this.highlightedConnectionPoint.side;
            } else {
                // 否则计算最优连接点
                const sourcePhysicalX = this.connectingNode.x + 2000;
                const sourcePhysicalY = this.connectingNode.y + 2000;
                const sourcePoint = this.getConnectionPoint(
                    { x: sourcePhysicalX, y: sourcePhysicalY, id: this.connectingNode.id },
                    this.selectedFromPoint
                );

                selectedToPoint = this.findOptimalConnectionSide(
                    { x: node.x + 2000, y: node.y + 2000, id: node.id },
                    { x: sourcePoint.x, y: sourcePoint.y }
                );
            }

            this.selectedToPoint = selectedToPoint;

            // 执行连接
            if (this.canConnect(this.connectingNode, node)) {
                this.addConnection(this.connectingNode.id, node.id, this.selectedFromPoint, this.selectedToPoint);
                this.showNotification('连接成功');
            } else {
                this.showNotification('无法连接到该节点', 'error');
            }
            this.resetConnectionMode();
        } else {
            // 点击同一个节点，取消连接
            this.showNotification('连接已取消');
            this.resetConnectionMode();
        }
    }

    resetConnectionMode() {
        this.connectingNode = null;
        this.selectedConnectionPoint = null;
        // 移除临时连线
        const tempConnection = this.connectionsSvg.querySelector('.temp-connection');
        if (tempConnection) {
            tempConnection.remove();
        }
        // 隐藏所有连接点
        this.hideAllConnectionPoints();
        document.querySelectorAll('.node').forEach(node => {
            node.classList.remove('connecting');
        });
    }

    showConnectionPoints(node) {
        // 隐藏之前的连接点
        this.hideAllConnectionPoints();

        const nodeElement = document.getElementById(`node-${node.id}`);
        if (!nodeElement) return;

        // 获取节点实际尺寸
        const nodeDimensions = this.getNodeDimensions(node, nodeElement);

        // 直接使用节点的世界坐标计算连接点位置
        const nodePhysicalX = node.x + 2000; // 转换为画布物理坐标
        const nodePhysicalY = node.y + 2000;

        // 计算连接点在画布容器中的显示位置
        const points = {
            top: {
                x: (nodePhysicalX + nodeDimensions.width / 2) * this.scale + this.offsetX,
                y: nodePhysicalY * this.scale + this.offsetY
            },
            right: {
                x: (nodePhysicalX + nodeDimensions.width) * this.scale + this.offsetX,
                y: (nodePhysicalY + nodeDimensions.height / 2) * this.scale + this.offsetY
            },
            bottom: {
                x: (nodePhysicalX + nodeDimensions.width / 2) * this.scale + this.offsetX,
                y: (nodePhysicalY + nodeDimensions.height) * this.scale + this.offsetY
            },
            left: {
                x: nodePhysicalX * this.scale + this.offsetX,
                y: (nodePhysicalY + nodeDimensions.height / 2) * this.scale + this.offsetY
            }
        };

        Object.entries(points).forEach(([side, pos]) => {
            const point = document.createElement('div');
            point.className = 'connection-point show';
            point.dataset.side = side;
            point.dataset.nodeId = node.id;
            point.style.position = 'absolute';
            point.style.left = `${pos.x}px`;
            point.style.top = `${pos.y}px`;

            // 添加点击事件
            point.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectConnectionPoint(side, point);
            });

            // 添加悬停效果
            point.addEventListener('mouseenter', () => {
                if (!this.selectedConnectionPoint) {
                    point.classList.add('active');
                }
            });

            point.addEventListener('mouseleave', () => {
                if (this.selectedConnectionPoint !== side) {
                    point.classList.remove('active');
                }
            });

            this.canvasContainer.appendChild(point);
        });
    }

    selectConnectionPoint(side, pointElement) {
        const nodeId = parseInt(pointElement.dataset.nodeId);
        const node = this.nodes.find(n => n.id === nodeId);

        if (!this.connectingNode) {
            // 第一步：选择源节点和连接点
            this.connectingNode = node;
            this.selectedFromPoint = side;
            pointElement.classList.add('selected');
            this.showNotification(`已选择源连接点，请选择目标节点的连接点`);
        } else if (this.connectingNode.id !== nodeId) {
            // 第二步：选择目标节点的连接点，完成连接
            this.selectedToPoint = side;

            // 执行连接
            if (this.canConnect(this.connectingNode, node)) {
                this.addConnection(this.connectingNode.id, nodeId, this.selectedFromPoint, this.selectedToPoint);
                this.showNotification('连接成功');
            } else {
                this.showNotification('无法连接到该节点', 'error');
            }
            this.resetConnectionMode();
        } else {
            // 点击同一个节点的其他连接点，重新选择源连接点
            document.querySelectorAll('.connection-point').forEach(p => {
                p.classList.remove('selected');
            });
            this.selectedFromPoint = side;
            pointElement.classList.add('selected');
            this.showNotification(`已重新选择源连接点`);
        }
    }

    getConnectionPointName(side) {
        const names = {
            top: '上方',
            right: '右侧',
            bottom: '下方',
            left: '左侧'
        };
        return names[side] || side;
    }

    showConnectionPointsForNode(node, mouseEvent) {
        // 显示连接点
        this.showConnectionPoints(node);

        // 获取鼠标位置
        const rect = this.canvasContainer.getBoundingClientRect();
        const mouseX = mouseEvent.clientX - rect.left;
        const mouseY = mouseEvent.clientY - rect.top;

        // 计算节点在屏幕上的位置
        const nodePhysicalX = node.x + 2000;
        const nodePhysicalY = node.y + 2000;
        const nodeScreenX = nodePhysicalX * this.scale + this.offsetX;
        const nodeScreenY = nodePhysicalY * this.scale + this.offsetY;
        const nodeElement = document.getElementById(`node-${node.id}`);
        if (!nodeElement) return;

        // 获取节点实际尺寸
        const nodeDimensions = this.getNodeDimensions(node, nodeElement);
        const nodeWidth = nodeDimensions.width * this.scale;
        const nodeHeight = nodeDimensions.height * this.scale;

        // 计算四个连接点的屏幕位置
        const connectionPoints = {
            top: {
                x: nodeScreenX + nodeWidth / 2,
                y: nodeScreenY,
                side: 'top'
            },
            right: {
                x: nodeScreenX + nodeWidth,
                y: nodeScreenY + nodeHeight / 2,
                side: 'right'
            },
            bottom: {
                x: nodeScreenX + nodeWidth / 2,
                y: nodeScreenY + nodeHeight,
                side: 'bottom'
            },
            left: {
                x: nodeScreenX,
                y: nodeScreenY + nodeHeight / 2,
                side: 'left'
            }
        };

        // 找到离鼠标最近的连接点
        let nearestPoint = null;
        let minDistance = Infinity;

        Object.values(connectionPoints).forEach(point => {
            const distance = Math.sqrt(
                Math.pow(mouseX - point.x, 2) +
                Math.pow(mouseY - point.y, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearestPoint = point;
            }
        });

        // 高亮最近的连接点
        if (nearestPoint) {
            const currentConnectionKey = `${node.id}-${nearestPoint.side}`;

            // 更新最近连接点记录
            this.lastHighlightedConnectionKey = currentConnectionKey;

            // 清除所有连接点的高亮状态
            document.querySelectorAll('.connection-point').forEach(pointElement => {
                pointElement.classList.remove('active');
            });

            // 高亮最近的连接点
            document.querySelectorAll('.connection-point').forEach(pointElement => {
                if (pointElement.dataset.side === nearestPoint.side &&
                    parseInt(pointElement.dataset.nodeId) === node.id) {
                    pointElement.classList.add('active');
                }
            });

            // 保存当前高亮的连接点
            this.highlightedConnectionPoint = {
                node: node,
                side: nearestPoint.side
            };
        }
    }

    getNodeDimensions(node, nodeElement) {
        const rect = nodeElement.getBoundingClientRect();
        const containerRect = this.canvasContainer.getBoundingClientRect();

        // 将屏幕尺寸转换为画布物理坐标尺寸
        return {
            width: rect.width / this.scale,
            height: rect.height / this.scale
        };
    }

    hideAllConnectionPoints() {
        document.querySelectorAll('.connection-point').forEach(point => {
            point.remove();
        });

        // 清除自动选择状态
        this.autoSelectedConnectionPoint = null;
    }

    clearAutoSelectedConnection() {
        this.lastSelectedConnectionKey = null;
        this.autoSelectedConnectionPoint = null;
    }

    canConnect(fromNode, toNode) {
        if (this.connections.some(conn => conn.from === fromNode.id && conn.to === toNode.id)) {
            return false;
        }

        if (fromNode.type === 'DECORATOR' || fromNode.type === 'SUBTREE') {
            const existingConnections = this.connections.filter(conn => conn.from === fromNode.id);
            if (existingConnections.length >= 1) return false;
        }

        if (['CONDITION', 'ACTION'].includes(fromNode.type)) {
            return false;
        }

        // 子树节点不应该能拥有父节点
        if (toNode.type === 'SUBTREE') {
            return false;
        }

        // 黑板节点连接限制：只能连接到根节点（没有父节点的节点，或只有黑板节点作为父节点的节点）
        if (fromNode.type === 'BLACKBOARD') {
            // 检查目标节点是否为根节点
            if (!this.isRootOrBlackboardOnlyChild(toNode)) {
                return false;
            }
        }

        return true;
    }

    // 检查节点是否为根节点或只有黑板节点作为父节点的节点
    isRootOrBlackboardOnlyChild(node) {
        // 查找指向该节点的所有连接
        const incomingConnections = this.connections.filter(conn => conn.to === node.id);

        // 如果没有任何连接指向该节点，说明它是根节点
        if (incomingConnections.length === 0) {
            return true;
        }

        // 如果有连接指向该节点，检查所有父节点是否都是黑板节点
        for (const conn of incomingConnections) {
            const parentNode = this.nodes.find(n => n.id === conn.from);
            if (!parentNode || parentNode.type !== 'BLACKBOARD') {
                return false; // 有非黑板父节点，不符合条件
            }
        }

        return true; // 所有父节点都是黑板节点（或没有父节点）
    }

    addConnection(fromId, toId, fromPoint = 'right', toPoint = 'left') {
        // 为新连接分配顺序号
        const existingConnections = this.connections.filter(conn => conn.from === fromId);
        const order = existingConnections.length;

        this.connections.push({
            from: fromId,
            to: toId,
            order: order,
            fromPoint: fromPoint,
            toPoint: toPoint
        });
        this.drawConnections();
        this.updateNodeDisplay();
        this.validateAllNodes();

        // 重新绑定拖拽事件
        this.rebindAllDragListeners();

        // 连接节点后保存历史状态和存储
        this.saveToStorage();
        this.saveHistoryState('连接节点');
    }

    drawConnections() {
        // 清除所有连线，保留临时连线
        const tempConnection = this.connectionsSvg.querySelector('.temp-connection');
        this.connectionsSvg.innerHTML = '';

        // 添加箭头标记定义
        this.addArrowMarkers();

        if (tempConnection) {
            this.connectionsSvg.appendChild(tempConnection);
        }

        this.connections.forEach((conn) => {
            const fromNode = this.nodes.find(n => n.id === conn.from);
            const toNode = this.nodes.find(n => n.id === conn.to);

            if (!fromNode || !toNode) return;

            const path = this.createConnectionPath(fromNode, toNode, conn);
            this.connectionsSvg.appendChild(path);
        });
    }

    // 添加箭头标记定义
    addArrowMarkers() {
        // 检查是否已存在defs元素
        let defs = this.connectionsSvg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            this.connectionsSvg.appendChild(defs);
        }

        // 实线箭头标记
        const directions = ['top', 'bottom', 'left', 'right'];
        const angles = { bottom: 270, top: 90, right: 180, left: 0 };
        defs.innerHTML = '';
        for (let index = 0; index < directions.length; index++) {
            const solidArrowMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            solidArrowMarker.setAttribute('id', `arrowhead-solid-${directions[index]}`);
            solidArrowMarker.setAttribute('markerWidth', '12');
            solidArrowMarker.setAttribute('markerHeight', '9');
            solidArrowMarker.setAttribute('refX', '11');
            solidArrowMarker.setAttribute('refY', '4.5');
            solidArrowMarker.setAttribute('orient', angles[directions[index]]); // 自动根据路径方向调整
            solidArrowMarker.setAttribute('markerUnits', 'userSpaceOnUse');
            solidArrowMarker.setAttribute('viewBox', '0 0 12 9');

            const solidArrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            solidArrowPath.setAttribute('d', 'M 0 0 L 12 4.5 L 0 9 Z');
            solidArrowPath.setAttribute('fill', '#56cc9d');
            solidArrowPath.setAttribute('stroke', 'none');
            solidArrowMarker.appendChild(solidArrowPath);

            // 虚线箭头标记
            const dashedArrowMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            dashedArrowMarker.setAttribute('id', `arrowhead-dashed-${directions[index]}`);
            dashedArrowMarker.setAttribute('markerWidth', '12');
            dashedArrowMarker.setAttribute('markerHeight', '9');
            dashedArrowMarker.setAttribute('refX', '11');
            dashedArrowMarker.setAttribute('refY', '4.5');
            dashedArrowMarker.setAttribute('orient', angles[directions[index]]); // 自动根据路径方向调整
            dashedArrowMarker.setAttribute('markerUnits', 'userSpaceOnUse');
            dashedArrowMarker.setAttribute('viewBox', '0 0 12 9');

            const dashedArrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            dashedArrowPath.setAttribute('d', 'M 0 0 L 12 4.5 L 0 9 Z');
            dashedArrowPath.setAttribute('fill', '#56cc9d');
            dashedArrowPath.setAttribute('stroke', 'none');
            dashedArrowPath.setAttribute('opacity', '0.8');
            dashedArrowMarker.appendChild(dashedArrowPath);

            // 清空并重新添加标记
            defs.appendChild(solidArrowMarker);
            defs.appendChild(dashedArrowMarker);
        }
    }

    createConnectionPath(fromNode, toNode, connection) {
        // 将世界坐标(-2000, -2000)到(2000, 2000)转换为画布物理坐标(0, 0)到(4000, 4000)
        const fromPhysicalX = fromNode.x + 2000;
        const fromPhysicalY = fromNode.y + 2000;
        const toPhysicalX = toNode.x + 2000;
        const toPhysicalY = toNode.y + 2000;

        // 获取节点实际尺寸
        const fromNodeElement = document.getElementById(`node-${fromNode.id}`);
        const toNodeElement = document.getElementById(`node-${toNode.id}`);

        let fromWidth = 180, fromHeight = 80;
        let toWidth = 180, toHeight = 80;

        if (fromNodeElement) {
            const fromDimensions = this.getNodeDimensions(fromNode, fromNodeElement);
            fromWidth = fromDimensions.width;
            fromHeight = fromDimensions.height;
        }

        if (toNodeElement) {
            const toDimensions = this.getNodeDimensions(toNode, toNodeElement);
            toWidth = toDimensions.width;
            toHeight = toDimensions.height;
        }

        // 计算连接点位置
        const fromPoint = this.calculateConnectionPoint(
            fromPhysicalX, fromPhysicalY, fromWidth, fromHeight,
            connection.fromPoint || 'right'
        );
        const toPoint = this.calculateConnectionPoint(
            toPhysicalX, toPhysicalY, toWidth, toHeight,
            connection.toPoint || 'left'
        );

        const startX = fromPoint.x;
        const startY = fromPoint.y;
        const endX = toPoint.x;
        const endY = toPoint.y;

        // 获取连线样式设置
        const connectionStyle = this.getConnectionStyle();

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d = '';

        if (connectionStyle === 'straight') {
            // 折线样式 - 有转折点的直线连接
            d = this.createPolylinePath(startX, startY, endX, endY, connection);
        } else {
            // 贝塞尔曲线样式（默认）
            let controlPoint1, controlPoint2;

            if (Math.abs(startX - endX) > Math.abs(startY - endY)) {
                // 水平连接
                const offsetX = Math.abs(startX - endX) * 0.4;
                controlPoint1 = { x: startX + (startX < endX ? offsetX : -offsetX), y: startY };
                controlPoint2 = { x: endX + (startX < endX ? -offsetX : offsetX), y: endY };
            } else {
                // 垂直连接
                const offsetY = Math.abs(startY - endY) * 0.4;
                controlPoint1 = { x: startX, y: startY + (startY < endY ? offsetY : -offsetY) };
                controlPoint2 = { x: endX, y: endY + (startY < endY ? -offsetY : offsetY) };
            }

            d = `M ${startX} ${startY} C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${endX} ${endY}`;
        }

        path.setAttribute('d', d);
        path.setAttribute('class', 'connection');
        // 添加箭头标记
        path.setAttribute('marker-end', `url(#arrowhead-solid-${connection.toPoint})`);

        return path;
    }

    // 创建折线路径（水平-垂直-水平或垂直-水平-垂直）
    createPolylinePath(startX, startY, endX, endY, connection) {
        const dx = endX - startX;
        const dy = endY - startY;

        // 根据起始和结束连接点确定折线路径
        const fromPoint = connection.fromPoint || 'right';
        const toPoint = connection.toPoint || 'left';

        let path = `M ${startX} ${startY}`;

        // 计算中间转折点
        if (fromPoint === 'right' && toPoint === 'left') {
            // 右到左：水平-垂直-水平
            const midX = startX + Math.abs(dx) * 0.5;
            path += ` L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
        } else if (fromPoint === 'left' && toPoint === 'right') {
            // 左到右：水平-垂直-水平
            const midX = startX - Math.abs(dx) * 0.5;
            path += ` L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
        } else if (fromPoint === 'bottom' && toPoint === 'top') {
            // 下到上：垂直-水平-垂直
            const midY = startY + Math.abs(dy) * 0.5;
            path += ` L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
        } else if (fromPoint === 'top' && toPoint === 'bottom') {
            // 上到下：垂直-水平-垂直
            const midY = startY - Math.abs(dy) * 0.5;
            path += ` L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
        } else {
            // 其他情况的智能处理
            if (Math.abs(dx) > Math.abs(dy)) {
                // 水平距离较大，优先水平连接
                const midX = startX + dx * 0.5;
                path += ` L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
            } else {
                // 垂直距离较大，优先垂直连接
                const midY = startY + dy * 0.5;
                path += ` L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
            }
        }

        return path;
    }

    // 计算连接点位置的简化方法
    calculateConnectionPoint(x, y, width, height, side) {
        const points = {
            top: { x: x + width / 2, y: y },
            right: { x: x + width, y: y + height / 2 },
            bottom: { x: x + width / 2, y: y + height },
            left: { x: x, y: y + height / 2 }
        };

        return points[side] || points.right;
    }

    getConnectionPoint(node, side) {
        // 获取节点实际尺寸
        let nodeWidth = 180;
        let nodeHeight = 80;

        // 如果node有id属性，说明是完整的节点对象，需要获取实际尺寸
        if (node.id !== undefined) {
            const nodeElement = document.getElementById(`node-${node.id}`);
            if (nodeElement) {
                const dimensions = this.getNodeDimensions({ id: node.id }, nodeElement);
                nodeWidth = dimensions.width;
                nodeHeight = dimensions.height;
            }
        }
        // 如果node只是坐标对象（如{x: 100, y: 100}），使用默认尺寸

        // 四个边的中点
        const points = {
            top: { x: node.x + nodeWidth / 2, y: node.y },
            right: { x: node.x + nodeWidth, y: node.y + nodeHeight / 2 },
            bottom: { x: node.x + nodeWidth / 2, y: node.y + nodeHeight },
            left: { x: node.x, y: node.y + nodeHeight / 2 }
        };

        return points[side] || points.right;
    }

    // 找到最优的连接点位置（返回坐标）
    findOptimalConnectionPoint(targetNode, sourcePoint) {
        // 获取目标节点实际尺寸
        let nodeWidth = 180;
        let nodeHeight = 80;

        if (targetNode.id !== undefined) {
            const nodeElement = document.getElementById(`node-${targetNode.id}`);
            const dimensions = this.getNodeDimensions({ id: targetNode.id }, nodeElement);
            nodeWidth = dimensions.width;
            nodeHeight = dimensions.height;
        }

        // 计算四个连接点
        const connectionPoints = {
            top: { x: targetNode.x + nodeWidth / 2, y: targetNode.y },
            right: { x: targetNode.x + nodeWidth, y: targetNode.y + nodeHeight / 2 },
            bottom: { x: targetNode.x + nodeWidth / 2, y: targetNode.y + nodeHeight },
            left: { x: targetNode.x, y: targetNode.y + nodeHeight / 2 }
        };

        // 找到离源点最近的连接点
        let bestPoint = connectionPoints.left;
        let minDistance = Infinity;

        Object.values(connectionPoints).forEach(point => {
            const distance = Math.sqrt(
                Math.pow(point.x - sourcePoint.x, 2) +
                Math.pow(point.y - sourcePoint.y, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                bestPoint = point;
            }
        });

        return bestPoint;
    }

    // 找到最优的连接点方向（返回方向名称）
    findOptimalConnectionSide(targetNode, sourcePoint) {
        // 获取目标节点实际尺寸
        let nodeWidth = 180;
        let nodeHeight = 80;

        if (targetNode.id !== undefined) {
            const nodeElement = document.getElementById(`node-${targetNode.id}`);
            if (nodeElement) {
                const dimensions = this.getNodeDimensions({ id: targetNode.id }, nodeElement);
                nodeWidth = dimensions.width;
                nodeHeight = dimensions.height;
            }
        }

        // 计算四个连接点
        const connectionPoints = {
            top: { x: targetNode.x + nodeWidth / 2, y: targetNode.y, side: 'top' },
            right: { x: targetNode.x + nodeWidth, y: targetNode.y + nodeHeight / 2, side: 'right' },
            bottom: { x: targetNode.x + nodeWidth / 2, y: targetNode.y + nodeHeight, side: 'bottom' },
            left: { x: targetNode.x, y: targetNode.y + nodeHeight / 2, side: 'left' }
        };

        // 找到离源点最近的连接点
        let bestSide = 'left';
        let minDistance = Infinity;

        Object.values(connectionPoints).forEach(point => {
            const distance = Math.sqrt(
                Math.pow(point.x - sourcePoint.x, 2) +
                Math.pow(point.y - sourcePoint.y, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                bestSide = point.side;
            }
        });

        return bestSide;
    }

    getOptimalConnectionPoint(node, targetCenter, isOutput) {
        // 获取节点实际尺寸
        let nodeWidth = 180;
        let nodeHeight = 80;
        // 如果node有id属性，说明是完整的节点对象，需要获取实际尺寸
        if (node.id !== undefined) {
            const nodeElement = document.getElementById(`node-${node.id}`);
            const dimensions = this.getNodeDimensions(node, nodeElement);
            nodeWidth = dimensions.width;
            nodeHeight = dimensions.height;
        }
        // 如果node只是坐标对象（如{x: 100, y: 100}），使用默认尺寸

        // 四个边的中点
        const points = {
            top: { x: node.x + nodeWidth / 2, y: node.y },
            right: { x: node.x + nodeWidth, y: node.y + nodeHeight / 2 },
            bottom: { x: node.x + nodeWidth / 2, y: node.y + nodeHeight },
            left: { x: node.x, y: node.y + nodeHeight / 2 }
        };

        // 计算到目标中心的距离，选择最近的连接点
        let bestPoint = isOutput ? points.right : points.left;
        let minDistance = Infinity;

        for (const [side, point] of Object.entries(points)) {
            const distance = Math.sqrt(
                Math.pow(point.x - targetCenter.x, 2) +
                Math.pow(point.y - targetCenter.y, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                bestPoint = point;
            }
        }

        return bestPoint;
    }

    selectTool(e) {
        document.querySelectorAll('.tool').forEach(tool => tool.classList.remove('active'));
        e.currentTarget.classList.add('active');

        const toolId = e.currentTarget.id;
        this.currentTool = toolId.replace('-tool', '');
        this.resetConnectionMode();
    }

    selectCanvasTool(e) {
        document.querySelectorAll('.tool-item').forEach(tool => tool.classList.remove('active'));
        e.currentTarget.classList.add('active');

        const toolId = e.currentTarget.id;
        this.currentTool = toolId.replace('-tool', '');
        this.resetConnectionMode();
    }

    selectNode(node) {
        this.selectedNode = node;
        if (node) {
            const panelTitle = document.getElementById('panel-property');
            panelTitle.style.display = 'block';
            const panel = document.getElementById('property-form');
            panel.style.display = 'block';
            this.highlightNode(node.id, 'selected');
            this.updatePropertyPanel();
        } else {
            const panelTitle = document.getElementById('panel-property');
            panelTitle.style.display = 'none';
            const panel = document.getElementById('property-form');
            panel.style.display = 'none';
            document.querySelectorAll('.node').forEach(n => {
                n.classList.remove('selected');
            });
            document.querySelectorAll('.form-group').forEach(n => {
                const input = n.querySelector('input');
                if (input)
                    input.value = '';
            });
        }
    }

    highlightNode(nodeId, className) {
        document.querySelectorAll('.node').forEach(node => {
            node.classList.remove('selected', 'connecting');
        });

        const nodeElement = document.getElementById(`node-${nodeId}`);
        if (nodeElement) {
            nodeElement.classList.add(className);
        }
    }

    updatePropertyPanel() {
        if (!this.selectedNode) {
            document.getElementById('node-type').value = '';
            document.getElementById('node-name').value = '';
            document.getElementById('node-x').value = '';
            document.getElementById('node-y').value = '';
            document.getElementById('node-function').value = '';
            document.getElementById('node-policy').value = '';
            document.getElementById('node-comment').value = '';
            document.getElementById('decorator-type').value = '';
            this.hideAllDecoratorAttributes();
            return;
        }

        document.getElementById('node-type').value = this.selectedNode.type;
        document.getElementById('node-name').value = this.selectedNode.name;
        document.getElementById('node-x').value = this.selectedNode.x;
        document.getElementById('node-y').value = this.selectedNode.y;
        document.getElementById('node-function').value = this.selectedNode.func;
        document.getElementById('node-policy').value = this.selectedNode.policy;
        document.getElementById('node-comment').value = this.selectedNode.comment;

        const functionGroup = document.getElementById('function-group');
        const policyGroup = document.getElementById('policy-group');
        const decoratorTypeGroup = document.getElementById('decorator-type-group');

        // 函数组显示逻辑：条件节点、行为节点需要显示
        const needsFunctionGroup = ['CONDITION', 'ACTION'].includes(this.selectedNode.type) || ['CONDITION_INTERRUPT'].includes(this.selectedNode.decoratorType);
        functionGroup.style.display = needsFunctionGroup ? 'block' : 'none';
        

        // 参数组显示逻辑：条件节点、行为节点需要显示参数配置
        const paramsGroup = document.getElementById('node-params-group');
        paramsGroup.style.display = needsFunctionGroup ? 'block' : 'none';

        // 初始化参数界面
        this.initializeParamsUI();

        policyGroup.style.display = this.selectedNode.type === 'PARALLEL' ? 'block' : 'none';
        decoratorTypeGroup.style.display = this.selectedNode.type === 'DECORATOR' ? 'block' : 'none';

        // 装饰器特殊处理
        if (this.selectedNode.type === 'DECORATOR') {
            document.getElementById('decorator-type').value = this.selectedNode.decoratorType || '';
            this.updateDecoratorAttributes();
        } else {
            this.hideAllDecoratorAttributes();
        }

        // 在属性填充完成后，检查并应用黑板引用样式
        setTimeout(() => {
            this.updateBlackboardReferences();
        }, 0);
    }

    handleDecoratorTypeChange() {
        const decoratorType = document.getElementById('decorator-type').value;

        // 清空所有装饰器属性输入框的内容
        document.getElementById('repeater-count').value = '';
        document.getElementById('timeout-duration').value = '';
        document.getElementById('retry-count').value = '';
        document.getElementById('cooldown-duration').value = '';
        document.getElementById('wait-duration').value = '';
        document.getElementById('subtree-reference').value = '';
        document.getElementById('node-function').value = '';

        // 清空节点对应的装饰器属性
        this.selectedNode.repeaterCount = '';
        this.selectedNode.timeoutDuration = '';
        this.selectedNode.retryCount = '';
        this.selectedNode.cooldownDuration = '';
        this.selectedNode.waitDuration = '';
        this.selectedNode.subtree = '';
        this.selectedNode.params = [];
        this.selectedNode.func = '';

        // 保存装饰器类型到节点
        this.selectedNode.decoratorType = decoratorType;

        // 更新装饰器属性显示
        this.updateDecoratorAttributes();

        // 更新节点显示
        this.updateNodeDisplay();

        // 保存更改
        this.saveToStorage();
        this.saveHistoryState('修改装饰器类型');
    }

    updateDecoratorAttributes() {
        const decoratorType = this.selectedNode?.decoratorType;

        // 首先隐藏所有装饰器属性
        this.hideAllDecoratorAttributes();
        document.getElementById('function-group').style.display = 'none';
        document.getElementById('node-params-group').style.display = 'none';

        if (!decoratorType) return;

        // 根据装饰器类型显示对应属性并填充值
        switch (decoratorType) {
            case 'REPEATER':
                document.getElementById('repeater-count-group').style.display = 'block';
                document.getElementById('repeater-count').value = this.selectedNode.repeaterCount || '';
                break;
            case 'TIMEOUT':
                document.getElementById('timeout-duration-group').style.display = 'block';
                document.getElementById('timeout-duration').value = this.selectedNode.timeoutDuration || '';
                break;
            case 'RETRY':
                document.getElementById('retry-count-group').style.display = 'block';
                document.getElementById('retry-count').value = this.selectedNode.retryCount || '';
                break;
            case 'COOLDOWN':
                document.getElementById('cooldown-duration-group').style.display = 'block';
                document.getElementById('cooldown-duration').value = this.selectedNode.cooldownDuration || '';
                break;
            case 'WAIT':
                document.getElementById('wait-duration-group').style.display = 'block';
                document.getElementById('wait-duration').value = this.selectedNode.waitDuration || '';
                break;
            case 'CONDITION_INTERRUPT':
                document.getElementById('function-group').style.display = 'block';
                document.getElementById('node-function').value = this.selectedNode.func || '';
                document.getElementById('node-params-group').style.display = 'block';
                this.renderParamsList();
                break;
            case 'SUBTREE_REF':
                document.getElementById('subtree-reference-group').style.display = 'block';
                document.getElementById('subtree-reference').value = this.selectedNode.subtree || '';
                break;
        }

        // 在装饰器属性填充完成后，检查并应用黑板引用样式
        setTimeout(() => {
            this.updateBlackboardReferences();
        }, 0);
    }

    hideAllDecoratorAttributes() {
        document.getElementById('repeater-count-group').style.display = 'none';
        document.getElementById('timeout-duration-group').style.display = 'none';
        document.getElementById('retry-count-group').style.display = 'none';
        document.getElementById('cooldown-duration-group').style.display = 'none';
        document.getElementById('wait-duration-group').style.display = 'none';
        document.getElementById('subtree-reference-group').style.display = 'none';
    }

    updateNodeDisplay() {
        this.nodes.forEach(node => {
            const nodeElement = document.getElementById(`node-${node.id}`);
            if (nodeElement) {
                nodeElement.innerHTML = this.generateNodeHTML(node);

                // 重新绑定事件监听器
                if (node.type === 'BLACKBOARD') {
                    this.setupBlackboardEvents(nodeElement, node);
                }
            }
        });
    }

    deleteNode(node) {
        const nodeElement = document.getElementById(`node-${node.id}`);
        nodeElement.remove();

        // 获取所有受影响的父节点（即该节点作为子节点时的父节点）
        const affectedParents = new Set();
        this.connections.forEach(conn => {
            if (conn.to === node.id) {
                affectedParents.add(conn.from);
            }
        });

        // 删除相关连接
        this.connections = this.connections.filter(conn =>
            conn.from !== node.id && conn.to !== node.id);

        // 重新分配受影响父节点的子节点序号
        affectedParents.forEach(parentId => {
            this.reassignChildOrder(parentId);
        });

        // 删除节点
        this.nodes = this.nodes.filter(n => n.id !== node.id);

        if (this.selectedNode?.id === node.id) {
            this.selectedNode = null;
            this.updatePropertyPanel();
        }

        this.drawConnections();
        this.updateNodeDisplay();
        this.validateAllNodes();
        this.updateStatus();
        this.rebindAllDragListeners();
        this.saveToStorage();

        // 删除节点后保存历史状态
        this.saveHistoryState('删除节点');
        this.showNotification('节点已删除');
    }

    reassignChildOrder(parentNodeId) {
        // 获取该父节点的所有子连接
        const childConnections = this.connections.filter(conn => conn.from === parentNodeId);

        // 按当前order排序
        childConnections.sort((a, b) => (a.order || 0) - (b.order || 0));

        // 重新分配连续的序号
        childConnections.forEach((conn, index) => {
            conn.order = index;
        });

        // 重新排序连接数组
        this.reorderParentConnections(parentNodeId);
    }

    deleteSelectedNode() {
        if (this.selectedNode) this.deleteNode(this.selectedNode);
    }

    adjustZoom(delta) {
        this.scale = Math.max(0.5, Math.min(this.scale + delta, 2));
        this.updateCanvasTransform();
        document.getElementById('zoom-level').textContent = `${Math.round(this.scale * 100)}%`;
    }

    resetView() {
        // 重置缩放比例
        this.scale = 1;

        // 获取画布容器尺寸
        const rect = this.canvasContainer.getBoundingClientRect();
        const containerWidth = rect.width || 800;
        const containerHeight = rect.height || 600;

        // 计算偏移量，使画布的(0,0)位置（对应世界坐标(-2000,-2000)）显示在屏幕中心
        // 画布物理坐标(2000,2000)对应世界坐标(0,0)
        this.offsetX = containerWidth / 2 - 2000 * this.scale;
        this.offsetY = containerHeight / 2 - 2000 * this.scale;

        this.updateCanvasTransform();
        document.getElementById('zoom-level').textContent = '100%';
    }

    startCanvasDrag(e) {
        if (e.target === this.canvas && this.currentTool === 'select') {
            this.isDragging = true;
            this.dragStartX = e.clientX - this.offsetX;
            this.dragStartY = e.clientY - this.offsetY;
            e.preventDefault(); // 防止默认行为
        }
    }

    dragCanvas(e) {
        if (!this.isDragging) return;

        // 完全移除边界限制，允许自由拖拽到任何位置
        this.offsetX = e.clientX - this.dragStartX;
        this.offsetY = e.clientY - this.dragStartY;

        // 实时检查是否需要扩展画布以适应新的视口范围
        this.checkCanvasExpansionForViewport();

        this.updateCanvasTransform();
    }

    checkCanvasExpansionForViewport() {
        // 移除复杂的动态扩展逻辑，保持画布大小固定
        // 这样可以避免节点位置的意外变化
    }

    endCanvasDrag() {
        this.isDragging = false;
    }

    handleCanvasClick(e) {
        if (e.target === this.canvas) {
            this.selectNode(null);
            this.resetConnectionMode();

            // 让所有输入框失去焦点
            document.querySelectorAll('input, textarea').forEach(input => {
                input.blur();
            });
        }
    }

    updateStatus() {
        document.getElementById('node-count').textContent = this.nodes.length;
    }

    showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type === 'error' ? 'error' : ''} show`;

        setTimeout(() => notification.classList.remove('show'), 3000);
    }

    exportLua() {
        // 首先找到所有根节点（包括黑板节点）
        const allRootNodes = this.nodes.filter(node =>
            !this.connections.some(conn => conn.to === node.id));

        if (allRootNodes.length === 0) {
            this.showNotification('没有根节点可导出', 'error');
            return;
        }

        // 检查是否有黑板节点作为根节点
        const blackboardRoots = allRootNodes.filter(node => node.type === 'BLACKBOARD');
        const nonBlackboardRoots = allRootNodes.filter(node => node.type !== 'BLACKBOARD');

        let actualRoot = null;

        if (blackboardRoots.length > 0) {
            // 如果有黑板根节点，找到黑板节点连接的第一个非黑板子节点作为实际根节点
            for (const blackboardRoot of blackboardRoots) {
                const children = this.connections
                    .filter(conn => conn.from === blackboardRoot.id)
                    .map(conn => this.nodes.find(n => n.id === conn.to))
                    .filter(child => child && child.type !== 'BLACKBOARD');

                if (children.length > 0) {
                    actualRoot = children[0]; // 使用第一个子节点作为实际根节点
                    break;
                }
            }
        }

        // 如果没有找到黑板连接的子节点，使用非黑板根节点
        if (!actualRoot && nonBlackboardRoots.length > 0) {
            actualRoot = nonBlackboardRoots[0];
        }

        if (!actualRoot) {
            this.showNotification('没有有效的根节点可导出', 'error');
            return;
        }

        // 生成主树代码和子树代码
        const { mainTreeCode, subtreesCode } = this.generateLuaCodeWithSubtrees(actualRoot);

        let luaCode;
        if (subtreesCode.length > 0) {
            // 如果有子树，输出包含子树的格式
            luaCode = `return \n${mainTreeCode.replace(/^return /, '').slice(0, -2)},\n    subtrees = {\n${subtreesCode.join(',\n')}\n    }\n}`;
        } else {
            // 如果没有子树，输出简单格式
            luaCode = mainTreeCode;
        }

        this.downloadFile(luaCode, `behavior_tree_${this.currentFileName}.lua`, 'text/plain');
        this.showNotification('Lua文件已导出');
    }

    generateLuaCodeWithSubtrees(rootNode) {
        // 收集所有子树节点
        const subtreeNodes = this.nodes.filter(node => node.type === 'SUBTREE');

        // 生成主树代码
        const mainTreeCode = this.generateLuaCodeForTree(rootNode, subtreeNodes);

        // 生成子树代码
        const subtreesCode = [];
        subtreeNodes.forEach(subtreeNode => {
            // 找到子树节点的第一个子节点作为子树的真正根节点
            const subtreeRootConnection = this.connections.find(conn => conn.from === subtreeNode.id);
            if (subtreeRootConnection) {
                const subtreeRootNode = this.nodes.find(n => n.id === subtreeRootConnection.to);
                if (subtreeRootNode) {
                    // 从子树的根节点开始生成代码
                    const subtreeCode = this.generateLuaCodeForTree(subtreeRootNode, []);
                    const subtreeConfigCode = subtreeCode
                        .replace(/^return /, '') // 去掉return包装
                        .split('\n')
                        .map(line => '        ' + line)
                        .join('\n');

                    subtreesCode.push(`        [${JSON.stringify(subtreeNode.name)}] = ${subtreeConfigCode}`);
                }
            }
        });

        return {
            mainTreeCode,
            subtreesCode
        };
    }

    generateLuaCodeForTree(node, subtreeNodes = []) {
        // 跳过黑板节点
        if (node.type === 'BLACKBOARD') {
            return '';
        }

        let code = `return {\n    type = BT.NodeType.${node.decoratorType ?? node.type},\n    name = ${JSON.stringify(node.name)}`;

        // 处理函数名，支持黑板引用
        if (node.func) {
            const funcValue = this.formatBlackboardReference(node.func, true);
            if (this.isBlackboardReference(node.func)) {
                code += `,\n    func = ${funcValue}`;
            } else {
                code += `,\n    func = ${this.formatFunctionOutput(node.func)}`;
            }
        }

        // 处理参数
        if (node.params && (JSON.stringify(node.params) !== '[]')) {
            code += ',\n    params = {\n';
            node.params.forEach((param, index) => {
                const paramName = param.name;
                const paramValue = this.formatBlackboardReference(param.value, true);
                if (paramName)
                    code += `        [${JSON.stringify(paramName)}] = ${paramValue || "nil"},\n`;
            })
            code = code.at(-2) === ',' ? code.slice(0, -2) + "\n" : code; // 移除最后一个逗号
            code += '    }';
        }

        // 处理策略，支持黑板引用
        if (node.policy) {
            const policyValue = this.formatBlackboardReference(node.policy, true);
            if (this.isBlackboardReference(node.policy)) {
                code += `,\n    policy = ${policyValue}`;
            } else {
                code += `,\n    policy = BT.ParallelPolicy.${node.policy}`;
            }
        }

        // 处理装饰器参数，支持黑板引用
        if (node.timeoutDuration) {
            const timeoutValue = this.formatBlackboardReference(node.timeoutDuration, true);
            code += `,\n    timeout_duration = ${timeoutValue}`;
        }

        if (node.cooldownDuration) {
            const cooldownValue = this.formatBlackboardReference(node.cooldownDuration, true);
            code += `,\n    cooldown_duration = ${cooldownValue}`;
        }

        if (node.waitDuration) {
            const waitValue = this.formatBlackboardReference(node.waitDuration, true);
            code += `,\n    wait_duration = ${waitValue}`;
        }

        if (node.repeaterCount) {
            const repeaterValue = this.formatBlackboardReference(node.repeaterCount, true);
            code += `,\n    repeater_count = ${repeaterValue}`;
        }

        if (node.retryCount) {
            const retryValue = this.formatBlackboardReference(node.retryCount, true);
            code += `,\n    max_retries = ${retryValue}`;
        }

        // 处理引用子树装饰器的函数
        if (node.decoratorType === 'SUBTREE_REF' && node.subtree) {
            const subtreeValue = this.formatBlackboardReference(node.subtree, true);
            code += `,\n    subtree_name = ${JSON.stringify(subtreeValue)}`;
        }

        // 获取子节点（已经按正确顺序排列），排除黑板节点和子树节点
        const children = this.connections
            .filter(conn => conn.from === node.id)
            .map(conn => this.nodes.find(n => n.id === conn.to))
            .filter(child => {
                if (!child) return false;
                if (child.type === 'BLACKBOARD') return false;
                // 如果当前是在生成主树，排除子树节点
                if (subtreeNodes.length > 0 && child.type === 'SUBTREE') return false;
                return true;
            });

        if (children.length > 0) {
            code += ',\n    children = {\n';
            const validChildren = children.map(child => this.generateLuaCodeForTree(child, subtreeNodes)).filter(childCode => childCode !== '');
            validChildren.forEach((childCode, index) => {
                const formattedChildCode = childCode
                    .replace(/^return /, '')
                    .split('\n')
                    .map(line => '        ' + line)
                    .join('\n');
                code += formattedChildCode;
                if (index < validChildren.length - 1) code += ',';
                code += '\n';
            });
            code += '    }';
        }

        code += '\n}';
        return code;
    }

    exportJson() {
        const data = {
            nodes: this.nodes,
            connections: this.connections,
            version: '1.0',
            createdAt: new Date().toISOString()
        };

        const json = JSON.stringify(data, null, 2);
        this.downloadFile(json, `behavior_tree_${this.currentFileName}.json`, 'application/json');
        this.showNotification('JSON文件已导出');
    }

    importJson() {
        document.getElementById('file-input').click();
    }

    handleFileImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.loadData(data);
                this.showNotification('文件导入成功');
            } catch (error) {
                this.showNotification('文件格式错误', 'error');
            }
        };
        reader.readAsText(file);
    }

    loadData(data) {
        this.canvas.innerHTML = '';
        this.connectionsSvg.innerHTML = '';
        this.nodes = data.nodes || [];
        this.connections = data.connections || [];
        this.nextNodeId = Math.max(...this.nodes.map(n => n.id), 0) + 1;

        this.nodes.forEach(node => {
            const nodeElement = this.createNodeElement(node);
            this.canvas.appendChild(nodeElement);
        });

        this.drawConnections();
        this.validateAllNodes();
        this.updateStatus();
        this.saveToStorage();
    }

    downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ===============================
    // 预览功能相关方法
    // ===============================

    // 预览Lua代码
    previewLua() {
        // 首先找到所有根节点（包括黑板节点）
        const allRootNodes = this.nodes.filter(node =>
            !this.connections.some(conn => conn.to === node.id));

        if (allRootNodes.length === 0) {
            this.showNotification('没有根节点可预览', 'error');
            return;
        }

        // 检查是否有黑板节点作为根节点
        const blackboardRoots = allRootNodes.filter(node => node.type === 'BLACKBOARD');
        const nonBlackboardRoots = allRootNodes.filter(node => node.type !== 'BLACKBOARD');

        let actualRoot = null;

        if (blackboardRoots.length > 0) {
            // 如果有黑板根节点，找到黑板节点连接的第一个非黑板子节点作为实际根节点
            for (const blackboardRoot of blackboardRoots) {
                const children = this.connections
                    .filter(conn => conn.from === blackboardRoot.id)
                    .map(conn => this.nodes.find(n => n.id === conn.to))
                    .filter(child => child && child.type !== 'BLACKBOARD');

                if (children.length > 0) {
                    actualRoot = children[0]; // 使用第一个子节点作为实际根节点
                    break;
                }
            }
        }

        // 如果没有找到黑板连接的子节点，使用非黑板根节点
        if (!actualRoot && nonBlackboardRoots.length > 0) {
            actualRoot = nonBlackboardRoots[0];
        }

        if (!actualRoot) {
            this.showNotification('没有有效的根节点可预览', 'error');
            return;
        }

        // 生成主树代码和子树代码
        const { mainTreeCode, subtreesCode } = this.generateLuaCodeWithSubtrees(actualRoot);

        let luaCode;
        if (subtreesCode.length > 0) {
            // 如果有子树，输出包含子树的格式
            luaCode = `return {\n${mainTreeCode.replace(/^return /, '').slice(0, -2)},\n    subtrees = {\n${subtreesCode.join(',\n')}\n    }\n}`;
        } else {
            // 如果没有子树，输出简单格式
            luaCode = mainTreeCode;
        }

        // 显示预览模态框
        this.showPreviewModal(luaCode);
    }

    // 显示预览模态框
    showPreviewModal(code) {
        const modal = document.getElementById('code-preview-modal');
        const codeElement = document.getElementById('code-preview-content');

        // 清除之前的高亮类名
        codeElement.className = '';
        codeElement.removeAttribute('data-highlighted');

        // 设置代码内容
        codeElement.textContent = code;

        // 显示模态框
        modal.classList.add('show');

        // 使用highlight.js进行语法高亮（延迟执行确保DOM已更新）
        setTimeout(() => {
            if (typeof window.hljs !== 'undefined') {
                // 添加语言类名
                codeElement.className = 'language-lua';

                // 执行高亮
                window.hljs.highlightElement(codeElement);

                console.log('Highlight.js applied to Lua code');
            } else {
                console.warn('Highlight.js not available');
            }
        }, 50);

        this.showNotification('Lua代码预览已生成');
    }

    // 复制预览代码
    copyPreviewCode() {
        const codeElement = document.getElementById('code-preview-content');
        const code = codeElement.textContent;

        if (!code) {
            this.showNotification('没有可复制的代码', 'error');
            return;
        }

        // 获取复制按钮用于显示反馈
        const copyBtn = document.getElementById('copy-code-btn');

        // 使用现代的Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(code).then(() => {
                this.showCopySuccess(copyBtn);
            }).catch((err) => {
                console.error('复制失败:', err);
                // 回退到传统方法
                this.fallbackCopyToClipboard(code, copyBtn);
            });
        } else {
            // 回退到传统的复制方法
            this.fallbackCopyToClipboard(code, copyBtn);
        }
    }

    // 显示复制成功反馈
    showCopySuccess(copyBtn) {
        // 保存原始状态
        const originalText = copyBtn.innerHTML;
        const originalClass = copyBtn.className;

        // 显示成功状态
        copyBtn.innerHTML = `<span class="icon">✓</span><span>已复制</span>`;
        copyBtn.classList.add('copied');

        this.showNotification('代码已复制到剪贴板');

        // 2秒后恢复原始状态
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.className = originalClass;
        }, 2000);
    }

    // 传统的复制到剪贴板方法（兼容性更好）
    fallbackCopyToClipboard(text, copyBtn) {
        try {
            // 创建临时文本区域
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);

            // 选中并复制
            textArea.focus();
            textArea.select();

            const successful = document.execCommand('copy');
            if (successful) {
                this.showCopySuccess(copyBtn);
            } else {
                throw new Error('复制命令执行失败');
            }

            // 清理
            document.body.removeChild(textArea);
        } catch (err) {
            console.error('复制失败:', err);
            this.showNotification('复制失败，请手动选择并复制代码', 'error');
        }
    }

    // 关闭预览模态框
    closePreview() {
        const modal = document.getElementById('code-preview-modal');
        modal.classList.remove('show');
    }

    saveToStorage() {
        const data = {
            nodes: this.nodes,
            connections: this.connections,
            nextNodeId: this.nextNodeId,
            lastModified: new Date().toISOString()
        };

        // 保存文件数据
        const storageKey = this.currentFileName ? `behaviorTree_${this.currentFileName}` : 'behaviorTree';
        localStorage.setItem(storageKey, JSON.stringify(data));

        // 记录当前使用的文件
        this.recordLastUsedFile();
    }

    loadFromStorage() {
        if (this.currentFileName) {
            // 加载指定文件
            this.loadFile(this.currentFileName);
        } else {
            // 加载默认文件
            const saved = localStorage.getItem('behaviorTree');
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    this.loadData(data);
                    this.nextNodeId = data.nextNodeId || this.nextNodeId;

                    // 确保现有连接都有order字段
                    this.ensureConnectionOrder();

                    // 简单定位到节点
                    if (this.nodes.length > 0) {
                        this.centerViewOnNodes();
                    }
                } catch (error) {
                    console.warn('无法加载保存的数据');
                }
            }
        }
    }

    centerViewOnNodes() {
        if (this.nodes.length === 0) return;
        // 将世界坐标转换为画布物理坐标
        const minX = Math.min(...this.nodes.map(n => n.x + 2000));
        const minY = Math.min(...this.nodes.map(n => n.y + 2000));
        const maxX = Math.max(...this.nodes.map(n => {
            const nodeElement = document.getElementById(`node-${n.id}`);
            const nodeDimensions = this.getNodeDimensions(n, nodeElement);
            return n.x + 2000 + nodeDimensions.width
        }));
        const maxY = Math.max(...this.nodes.map(n => {
            const nodeElement = document.getElementById(`node-${n.id}`);
            const nodeDimensions = this.getNodeDimensions(n, nodeElement);
            return n.y + 2000 + nodeDimensions.height
        }));

        // 计算节点区域的中心点（画布物理坐标）
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // 获取画布容器尺寸
        const rect = this.canvasContainer.getBoundingClientRect();
        const containerWidth = rect.width;
        const containerHeight = rect.height;

        // 计算需要的偏移量，使节点区域居中显示
        this.offsetX = containerWidth / 2 - centerX * this.scale;
        this.offsetY = containerHeight / 2 - centerY * this.scale;

        // 更新画布变换
        this.updateCanvasTransform();
    }

    ensureConnectionOrder() {
        // 为没有order字段的连接分配order
        this.nodes.forEach(node => {
            const connections = this.connections.filter(conn => conn.from === node.id);
            connections.forEach((conn, index) => {
                if (conn.order === undefined) {
                    conn.order = index;
                }
            });
        });
        this.saveToStorage();
    }

    autoSave() {
        setInterval(() => {
            if (this.nodes.length > 0) this.saveToStorage();
        }, 30000);
    }

    // 设置管理方法
    openSettings() {
        const modal = document.getElementById('settings-modal');
        const prefixInput = document.getElementById('function-prefix');
        const connectionStyleSelect = document.getElementById('connection-style');

        // 载入当前设置
        const currentPrefix = localStorage.getItem('functionPrefix') || '';
        const currentConnectionStyle = localStorage.getItem('connectionStyle') || 'curved';

        prefixInput.value = currentPrefix;
        connectionStyleSelect.value = currentConnectionStyle;

        modal.classList.add('show');

        // 聚焦到输入框
        setTimeout(() => prefixInput.focus(), 100);
    }

    closeSettings() {
        const modal = document.getElementById('settings-modal');
        modal.classList.remove('show');
    }

    saveSettings() {
        const prefixInput = document.getElementById('function-prefix');
        const connectionStyleSelect = document.getElementById('connection-style');

        const newPrefix = prefixInput.value.trim();
        const newConnectionStyle = connectionStyleSelect.value;

        // 保存到localStorage
        if (newPrefix) {
            localStorage.setItem('functionPrefix', newPrefix);
        } else {
            localStorage.removeItem('functionPrefix');
        }

        localStorage.setItem('connectionStyle', newConnectionStyle);

        this.closeSettings();
        this.showNotification('设置已保存');

        // 如果连线样式发生变化，重新绘制连线
        const oldStyle = this.connectionStyle || 'curved';
        this.connectionStyle = newConnectionStyle;
        if (oldStyle !== newConnectionStyle) {
            this.drawConnections();
        }

        // 如果有选中的节点，更新显示
        if (this.selectedNode) {
            this.updateNodeDisplay();
        }
    }

    openHelp() {
        const modal = document.getElementById('help-modal');
        modal.classList.add('show');

        // 如果尚未加载帮助内容，则加载markdown文件
        if (!this.helpContentLoaded) {
            this.loadHelpContent();
        }
    }

    // 加载帮助内容
    async loadHelpContent() {
        const helpContent = document.getElementById('help-content');

        try {
            // 显示加载状态
            helpContent.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">正在加载帮助文档...</div>';

            // 请求markdown文件
            const response = await fetch('./helper.md');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const markdownText = await response.text();

            // 使用marked库渲染markdown
            let htmlContent = marked.parse(markdownText);

            // 处理按键语法 $(xxx) -> 按键样式
            htmlContent = this.processKeyboardShortcuts(htmlContent);

            helpContent.innerHTML = htmlContent;

            // 标记已加载
            this.helpContentLoaded = true;

        } catch (error) {
            console.error('加载帮助文档失败:', error);
            helpContent.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #e74c3c;">
                    <h3>加载帮助文档失败</h3>
                    <p>错误信息: ${error.message}</p>
                    <p>请确保 helper.md 文件存在于当前目录下</p>
                </div>
            `;
        }
    }

    // 处理键盘快捷键语法，将$(xxx)转换为按键样式
    processKeyboardShortcuts(htmlContent) {
        return htmlContent.replace(/\$\(([^)]+)\)/g, (match, keyText) => {
            return `<kbd class="keyboard-key">${keyText}</kbd>`;
        });
    }

    // 处理键盘快捷键语法，将$(xxx)转换为按键样式
    processKeyboardShortcuts(htmlContent) {
        return htmlContent.replace(/\$\(([^)]+)\)/g, (match, keyText) => {
            return `<kbd class="keyboard-key">${keyText}</kbd>`;
        });
    }

    closeHelp() {
        const modal = document.getElementById('help-modal');
        modal.classList.remove('show');
    }

    getConnectionStyle() {
        if (!this.connectionStyle) {
            this.connectionStyle = localStorage.getItem('connectionStyle') || 'curved';
        }
        return this.connectionStyle;
    }

    getFunctionPrefix() {
        return localStorage.getItem('functionPrefix') || '';
    }

    formatFunctionOutput(functionName) {
        if (!functionName) return '';

        // 如果以?开头，忽略通用路径前缀
        if (functionName.startsWith('?')) {
            const actualFunctionName = functionName.substring(1); // 去掉?前缀
            return `require "${actualFunctionName}"`;
        }

        const prefix = this.getFunctionPrefix();
        if (prefix) {
            return `require "${prefix}.${functionName}"`;
        } else {
            return `require "${functionName}"`;
        }
    }

    // 历史记录管理方法
    saveHistoryState(action = '操作') {
        // 创建当前状态的快照
        const state = {
            nodes: JSON.parse(JSON.stringify(this.nodes)),
            connections: JSON.parse(JSON.stringify(this.connections)),
            nextNodeId: this.nextNodeId,
            timestamp: Date.now(),
            action: action
        };

        // 如果当前不在历史末尾，删除后续历史
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        // 添加新状态到历史
        this.history.push(state);

        // 限制历史记录大小
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }

        this.updateHistoryUI();
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreHistoryState(this.history[this.historyIndex]);
            this.showNotification('撤回操作成功');
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreHistoryState(this.history[this.historyIndex]);
            this.showNotification('恢复操作成功');
        }
    }

    restoreHistoryState(state) {
        // 清空画布和连线
        this.canvas.innerHTML = '';
        this.connectionsSvg.innerHTML = '';

        // 恢复数据
        this.nodes = JSON.parse(JSON.stringify(state.nodes));
        this.connections = JSON.parse(JSON.stringify(state.connections));
        this.nextNodeId = state.nextNodeId;

        // 重新创建节点元素
        this.nodes.forEach(node => {
            const nodeElement = this.createNodeElement(node);
            this.canvas.appendChild(nodeElement);
        });

        // 重新绘制连线
        this.drawConnections();
        this.validateAllNodes();
        this.updateStatus();

        // 确保重新绑定所有事件监听器
        setTimeout(() => {
            this.rebindAllDragListeners();
        }, 50);

        // 清除选中状态
        this.selectedNode = null;
        this.updatePropertyPanel();

        // 重置连接模式
        this.resetConnectionMode();

        // ⭐ 关键修复：同步保存当前状态到localStorage
        this.saveToStorage();

        this.updateHistoryUI();
    }

    updateHistoryUI() {
        // 更新撤回/恢复按钮状态
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        undoBtn.disabled = this.historyIndex <= 0;
        redoBtn.disabled = this.historyIndex >= this.history.length - 1;

        this.updateHistoryList();
    }

    updateHistoryList() {
        const historyList = document.getElementById('history-list');

        if (this.history.length === 0) {
            historyList.innerHTML = `
                <div class="history-item">
                    <div class="history-item-content">
                        <div class="history-item-title">暂无操作历史</div>
                        <div class="history-item-meta">请开始编辑</div>
                    </div>
                </div>
            `;
            return;
        }

        historyList.innerHTML = this.history.map((state, index) => {
            const date = new Date(state.timestamp);
            const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            const currentClass = index === this.historyIndex ? 'current' : '';

            return `
                <div class="history-item ${currentClass}" onclick="bte.jumpToHistoryState(${index})">
                    <div class="history-item-content">
                        <div class="history-item-title">${state.action}</div>
                        <div class="history-item-meta">${timeStr}<br>${state.nodes.length}节点</div>
                    </div>
                </div>
            `;
        }).reverse().join(''); // 反转显示，最新的在上面
    }

    jumpToHistoryState(targetIndex) {
        if (targetIndex >= 0 && targetIndex < this.history.length) {
            this.historyIndex = targetIndex;
            this.restoreHistoryState(this.history[targetIndex]);
            this.showNotification(`已跳转到历史状态: ${this.history[targetIndex].action}`);

            // 隐藏历史列表
            document.getElementById('history-list').classList.remove('show');
        }
    }

    toggleHistoryList() {
        const historyList = document.getElementById('history-list');
        historyList.classList.toggle('show');
    }

    startNodeRename() {
        if (!this.selectedNode) return;

        // 直接聚焦到右侧属性面板的节点名称输入框
        const nodeNameInput = document.getElementById('node-name');
        nodeNameInput.focus();
        nodeNameInput.select();

        this.showNotification('请在右侧属性面板修改节点名称');
    }

    handleDisconnection(node) {
        // 获取该节点的所有连接
        const incomingConnections = this.connections.filter(conn => conn.to === node.id);
        const outgoingConnections = this.connections.filter(conn => conn.from === node.id);

        if (incomingConnections.length === 0 && outgoingConnections.length === 0) {
            this.showNotification('该节点没有连接', 'error');
            return;
        }

        // 获取所有受影响的父节点（即该节点作为子节点时的父节点）
        const affectedParents = new Set();
        incomingConnections.forEach(conn => {
            affectedParents.add(conn.from);
        });
        outgoingConnections.forEach(conn => {
            const targetConnections = this.connections.filter(c => c.from === conn.to);
            targetConnections.forEach(tc => affectedParents.add(tc.from));
        });

        // 移除所有相关连接
        this.connections = this.connections.filter(conn =>
            conn.from !== node.id && conn.to !== node.id
        );

        // 重新分配受影响父节点的子节点序号
        affectedParents.forEach(parentId => {
            this.reassignChildOrder(parentId);
        });

        this.drawConnections();
        this.updateNodeDisplay();
        this.validateAllNodes();
        this.rebindAllDragListeners();

        // 断开连接后保存历史状态和存储
        this.saveToStorage();
        this.saveHistoryState('断开连接');
        this.showNotification(`已断开节点 "${node.name}" 的所有连接`);
    }

    getChildrenWithOrder(parentNodeId) {
        const connections = this.connections.filter(conn => conn.from === parentNodeId);
        return connections.map((conn, index) => ({
            connection: conn,
            node: this.nodes.find(n => n.id === conn.to),
            order: conn.order !== undefined ? conn.order : index
        })).sort((a, b) => a.order - b.order);
    }

    updateChildrenOrder(parentNodeId) {
        const connections = this.connections.filter(conn => conn.from === parentNodeId);
        connections.forEach((conn, index) => {
            if (conn.order === undefined) {
                conn.order = index;
            }
        });
    }

    swapChildOrder(parentNodeId, fromOrder, toOrder) {
        const connections = this.connections.filter(conn => conn.from === parentNodeId);
        const fromConn = connections.find(conn => conn.order === fromOrder);
        const toConn = connections.find(conn => conn.order === toOrder);

        if (fromConn && toConn) {
            // 交换顺序
            fromConn.order = toOrder;
            toConn.order = fromOrder;

            // 立即重新排序该父节点的所有连接
            this.reorderParentConnections(parentNodeId);

            this.updateNodeDisplay();
            this.saveToStorage();

            // ⭐ 关键修复：保存历史状态
            this.saveHistoryState('调整子节点顺序');
        }
    }

    reorderParentConnections(parentNodeId) {
        // 获取该父节点的所有连接
        const parentConnections = this.connections.filter(conn => conn.from === parentNodeId);
        const otherConnections = this.connections.filter(conn => conn.from !== parentNodeId);

        // 按order排序父节点的连接
        parentConnections.sort((a, b) => (a.order || 0) - (b.order || 0));

        // 重新组合连接数组，确保该父节点的连接按正确顺序排列
        this.connections = [...otherConnections, ...parentConnections];
    }

    setupChildOrderDragListeners(nodeElement, parentNode) {
        // 为该节点的子项序号设置拖拽监听器
        setTimeout(() => {
            const childOrders = nodeElement.querySelectorAll('.child-order');
            const childItems = nodeElement.querySelectorAll('.child-item');

            childOrders.forEach(orderElement => {
                orderElement.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    const childItem = orderElement.closest('.child-item');
                    const childId = childItem.dataset.childId;
                    const order = parseInt(childItem.dataset.order);

                    orderElement.classList.add('dragging');

                    // 存储拖拽数据
                    this.draggedChild = {
                        parentNodeId: parentNode.id,
                        childId: childId,
                        order: order,
                        element: orderElement
                    };
                });

                orderElement.addEventListener('dragend', (e) => {
                    e.stopPropagation();
                    orderElement.classList.remove('dragging');

                    // 清理所有拖拽状态
                    childItems.forEach(item => item.classList.remove('drag-over'));
                    this.draggedChild = null;
                });
            });

            childItems.forEach(childItem => {
                childItem.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (this.draggedChild && this.draggedChild.parentNodeId === parentNode.id) {
                        // 清除其他项的拖拽状态
                        childItems.forEach(item => item.classList.remove('drag-over'));
                        childItem.classList.add('drag-over');
                    }
                });

                childItem.addEventListener('dragleave', (e) => {
                    e.stopPropagation();
                    childItem.classList.remove('drag-over');
                });

                childItem.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (this.draggedChild && this.draggedChild.parentNodeId === parentNode.id) {
                        const targetOrder = parseInt(childItem.dataset.order);
                        const sourceOrder = this.draggedChild.order;

                        if (sourceOrder !== targetOrder) {
                            // 执行顺序交换
                            this.swapChildOrder(parentNode.id, sourceOrder, targetOrder);
                            this.showNotification(`已交换子节点顺序: ${sourceOrder + 1} ↔ ${targetOrder + 1}`);
                        }
                    }

                    // 清理拖拽状态
                    childItems.forEach(item => item.classList.remove('drag-over'));
                });
            });
        });
    }

    rebindAllDragListeners() {
        // 重新绑定所有节点的拖拽监听器
        this.nodes.forEach(node => {
            const nodeElement = document.getElementById(`node-${node.id}`);
            if (nodeElement) {
                this.setupChildOrderDragListeners(nodeElement, node);
                this.setupNodeOrderBadgeDragListeners(nodeElement, node);
            }
        });
    }

    getNodeOrderBadge(nodeId) {
        // 查找该节点是否为某个节点的子节点，并获取其序号
        const parentConnection = this.connections.find(conn => conn.to === nodeId);

        if (!parentConnection) {
            return ''; // 不是子节点，不显示序号
        }

        // 检查父节点是否是黑板节点，如果是则不显示序号
        const parentNode = this.nodes.find(n => n.id === parentConnection.from);
        if (parentNode && parentNode.type === 'BLACKBOARD') {
            return ''; // 黑板节点连接的子节点不显示序号
        }

        const order = parentConnection.order !== undefined ? parentConnection.order : 0;
        const displayOrder = order + 1; // 显示从1开始的序号

        return `
            <div class="node-order-badge" draggable="true" data-order="${order}" data-parent-id="${parentConnection.from}">
                ${displayOrder}
            </div>
        `;
    }

    setupNodeOrderBadgeDragListeners(nodeElement, node) {
        // 为该节点的序号徽章设置拖拽监听器
        setTimeout(() => {
            const orderBadge = nodeElement.querySelector('.node-order-badge');
            if (!orderBadge) return;

            // 阻止序号徽章触发节点的mousedown事件
            orderBadge.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });

            orderBadge.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                const order = parseInt(orderBadge.dataset.order);
                const parentId = parseInt(orderBadge.dataset.parentId);

                orderBadge.classList.add('dragging');

                // 标记正在拖拽序号徽章，阻止节点拖拽
                this.isDraggingOrderBadge = true;

                // 存储拖拽数据，使用拖拽开始时的order值
                this.draggedOrderBadge = {
                    nodeId: node.id,
                    parentId: parentId,
                    order: order,
                    element: orderBadge
                };
            });

            orderBadge.addEventListener('dragend', (e) => {
                e.stopPropagation();
                orderBadge.classList.remove('dragging');

                // 重置拖拽状态
                this.isDraggingOrderBadge = false;

                // 清理拖拽状态
                document.querySelectorAll('.node').forEach(n => {
                    n.classList.remove('drag-over');
                });
                this.draggedOrderBadge = null;
            });
        });

        // 为所有节点设置拖放监听器
        nodeElement.addEventListener('dragover', (e) => {
            if (this.draggedOrderBadge) {
                e.preventDefault();
                e.stopPropagation();

                // 检查是否是同一父节点的子节点
                const targetConnection = this.connections.find(conn => conn.to === node.id);
                if (targetConnection && targetConnection.from === this.draggedOrderBadge.parentId && node.id !== this.draggedOrderBadge.nodeId) {
                    nodeElement.classList.add('drag-over');
                }
            }
        });

        nodeElement.addEventListener('dragleave', (e) => {
            if (this.draggedOrderBadge) {
                e.stopPropagation();
                nodeElement.classList.remove('drag-over');
            }
        });

        nodeElement.addEventListener('drop', (e) => {
            if (this.draggedOrderBadge) {
                e.preventDefault();
                e.stopPropagation();

                // 检查是否是同一父节点的子节点
                const targetConnection = this.connections.find(conn => conn.to === node.id);
                if (targetConnection && targetConnection.from === this.draggedOrderBadge.parentId && node.id !== this.draggedOrderBadge.nodeId) {
                    // *在交换前*获取两个节点的order值和显示序号
                    const sourceOrder = this.draggedOrderBadge.order;
                    const targetOrder = targetConnection.order;
                    const sourceDisplayOrder = sourceOrder + 1;
                    const targetDisplayOrder = targetOrder + 1;

                    // 只有在源和目标序号不同时才执行交换
                    if (sourceOrder !== targetOrder) {
                        // 执行顺序交换
                        this.swapChildOrder(this.draggedOrderBadge.parentId, sourceOrder, targetOrder);
                        this.rebindAllDragListeners();
                        this.showNotification(`已交换子节点顺序: ${sourceDisplayOrder} ↔ ${targetDisplayOrder}`);
                    }
                }

                nodeElement.classList.remove('drag-over');
            }
        });
    }

    // ⭐ 垃圾桶删除功能相关方法
    showTrashZone() {
        const trashZone = document.getElementById('trash-zone');
        trashZone.classList.add('show');
        this.setupTrashZoneListeners();
    }

    hideTrashZone() {
        const trashZone = document.getElementById('trash-zone');
        trashZone.classList.remove('show', 'drag-over');
        // 清除事件监听器标记，下次可以重新绑定
        trashZone.removeAttribute('data-listeners-attached');
    }

    checkTrashZoneHover(e) {
        const trashZone = document.getElementById('trash-zone');
        if (!trashZone.classList.contains('show')) return;

        const rect = trashZone.getBoundingClientRect();
        const isOverTrashZone = e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom;

        if (isOverTrashZone) {
            trashZone.classList.add('drag-over');
        } else {
            trashZone.classList.remove('drag-over');
        }
    }

    setupTrashZoneListeners() {
        const trashZone = document.getElementById('trash-zone');

        // 防止重复绑定事件
        if (trashZone.hasAttribute('data-listeners-attached')) return;
        trashZone.setAttribute('data-listeners-attached', 'true');

        trashZone.addEventListener('dragover', (e) => {
            if (this.draggingNode) {
                e.preventDefault();
                trashZone.classList.add('drag-over');
            }
        });

        trashZone.addEventListener('dragleave', (e) => {
            // 检查是否真正离开垃圾桶区域
            const rect = trashZone.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;

            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                trashZone.classList.remove('drag-over');
            }
        });

        trashZone.addEventListener('drop', (e) => {
            if (this.draggingNode) {
                e.preventDefault();
                e.stopPropagation();

                // 执行删除操作
                const nodeToDelete = this.draggingNode;
                this.draggingNode = null; // 先清空拖拽状态

                this.deleteNode(nodeToDelete);
                this.hideTrashZone();

                this.showNotification(`节点 "${nodeToDelete.name}" 已删除`);
            }
        });
    }

    // ===============================
    // 文件管理相关方法
    // ===============================

    // 打开新建文件模态框
    openNewFileModal() {
        const modal = document.getElementById('new-file-modal');
        const input = document.getElementById('new-file-name');

        modal.classList.add('show');
        input.value = '';

        // 聚焦到输入框
        setTimeout(() => input.focus(), 100);
    }

    // 关闭新建文件模态框
    closeNewFileModal() {
        const modal = document.getElementById('new-file-modal');
        modal.classList.remove('show');
    }

    // 创建新文件
    createNewFile() {
        const input = document.getElementById('new-file-name');
        const fileName = input.value.trim();

        // 验证文件名
        if (!fileName) {
            this.showNotification('请输入文件名', 'error');
            return;
        }

        // 检查文件名是否包含非法字符
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(fileName)) {
            this.showNotification('文件名包含非法字符', 'error');
            return;
        }

        // 检查文件是否已存在
        const existingFiles = this.getAllFiles();
        if (existingFiles.some(file => file.name === fileName)) {
            this.showNotification('文件名已存在', 'error');
            return;
        }

        // 保存当前编辑状态到当前文件
        this.saveToStorage();

        // 清空当前编辑器状态，创建新文件
        this.clearEditor();
        this.currentFileName = fileName;

        // 保存新的空文件状态
        this.saveToStorage();

        // 更新界面显示
        this.updateCurrentFileDisplay();

        this.closeNewFileModal();
        this.showNotification(`新文件 "${fileName}" 创建成功`);
    }

    // 打开文件管理器
    openFileManager() {
        const modal = document.getElementById('file-manager-modal');
        modal.classList.add('show');
        this.refreshFileList();
    }

    // 关闭文件管理器
    closeFileManager() {
        const modal = document.getElementById('file-manager-modal');
        modal.classList.remove('show');
    }

    // 刷新文件列表
    refreshFileList() {
        const fileList = document.getElementById('file-list');
        const files = this.getAllFiles();

        if (files.length === 0) {
            fileList.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #aaa;">
                    暂无保存的文件
                </div>
            `;
            // 清除选中状态和按钮状态
            this.selectedFileItem = null;
            this.updateFileManagerFooterButtons();
            return;
        }

        // 按修改时间排序，最新的在前
        files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

        fileList.innerHTML = files.map(file => {
            const date = new Date(file.lastModified);
            const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            const isCurrentFile = file.name === this.getCurrentFileName();

            return `
                <div class="file-item ${isCurrentFile ? 'current' : ''}" data-filename="${file.name}" onclick="bte.selectFileItem('${file.name}')">
                    <div class="file-name">
                        <span class="icon">📄</span>
                        <span>${file.name}</span>
                    </div>
                    <div class="file-info">
                        <div class="file-time">${timeStr}</div>
                        <div class="file-stats">${file.nodeCount} 节点</div>
                    </div>
                </div>
            `;
        }).join('');

        // 重置选中状态
        this.selectedFileItem = null;
        this.updateFileManagerFooterButtons();

        // 更新当前文件信息显示
        this.updateCurrentFileDisplay();
    }

    // 获取所有保存的文件
    getAllFiles() {
        const files = [];

        // 遍历localStorage查找所有以'behaviorTree_'开头的键
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('behaviorTree_')) {
                const fileName = key.replace('behaviorTree_', '');
                if (fileName) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        files.push({
                            name: fileName,
                            lastModified: data.lastModified || new Date().toISOString(),
                            nodeCount: data.nodes ? data.nodes.length : 0
                        });
                    } catch (e) {
                        // 忽略无效的数据
                    }
                }
            }
        }

        // 检查默认文件
        const defaultData = localStorage.getItem('behaviorTree');
        if (defaultData) {
            try {
                const data = JSON.parse(defaultData);
                // 只有当没有其他文件且默认文件有内容时才显示
                if (files.length === 0 || (data.nodes && data.nodes.length > 0)) {
                    files.push({
                        name: '默认文件',
                        lastModified: data.lastModified || new Date().toISOString(),
                        nodeCount: data.nodes ? data.nodes.length : 0
                    });
                }
            } catch (e) {
                // 忽略无效的数据
            }
        }

        return files;
    }

    // 获取当前文件名
    getCurrentFileName() {
        return this.currentFileName || '默认文件';
    }

    // 更新当前文件显示
    updateCurrentFileDisplay() {
        const currentFileNameElement = document.getElementById('current-file-name');
        if (currentFileNameElement) {
            currentFileNameElement.textContent = this.getCurrentFileName();
        }
        const currentFileDisplayElement = document.getElementById('current-file-display');
        if (currentFileDisplayElement) {
            currentFileDisplayElement.textContent = this.getCurrentFileName();
        }
    }

    // 选中文件项
    selectFileItem(fileName) {
        // 清除之前的选中状态
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('selected');
        });

        // 选中新文件项
        const fileItem = document.querySelector(`[data-filename="${fileName}"]`);
        if (fileItem) {
            fileItem.classList.add('selected');
            this.selectedFileItem = fileItem;

            // 更新footer按钮状态
            this.updateFileManagerFooterButtons();
        }
    }

    // 更新文件管理器footer按钮状态
    updateFileManagerFooterButtons() {
        const renameBtn = document.getElementById('rename-file-btn');
        const switchBtn = document.getElementById('switch-file-btn');
        const deleteBtn = document.getElementById('delete-file-btn');

        if (this.selectedFileItem) {
            const fileName = this.selectedFileItem.dataset.filename;
            const isCurrentFile = fileName === this.getCurrentFileName();

            // 启用所有按钮
            renameBtn.disabled = false;
            switchBtn.disabled = isCurrentFile; // 当前文件不能切换
            deleteBtn.disabled = isCurrentFile; // 当前文件不能删除
        } else {
            // 没有选中文件，禁用所有按钮
            renameBtn.disabled = true;
            switchBtn.disabled = true;
            deleteBtn.disabled = true;
            switchBtn.textContent = '切换到此文件';
        }
    }

    // 重命名选中的文件
    renameSelectedFile() {
        if (!this.selectedFileItem) {
            this.showNotification('请先选中一个文件', 'error');
            return;
        }

        const fileName = this.selectedFileItem.dataset.filename;
        const fileNameBody = this.selectedFileItem.querySelector('.file-name');
        const fileNameElement = this.selectedFileItem.querySelector('.file-name span:not(.icon)');

        // 保存原始文件名
        this.originalFileName = fileName;

        // 创建输入框
        fileNameBody.classList.add("renaming");
        const input = document.createElement('input');
        input.type = 'text';
        input.value = fileName;
        input.className = 'file-rename-input';

        // 替换文件名显示
        fileNameElement.style.display = 'none';
        fileNameElement.parentNode.insertBefore(input, fileNameElement.nextSibling);

        // 聚焦并选中文件名（不包括扩展名）
        input.focus();
        const dotIndex = fileName.lastIndexOf('.');
        if (dotIndex > 0) {
            input.setSelectionRange(0, dotIndex);
        } else {
            input.select();
        }

        // 标记为重命名状态
        this.isRenamingFile = true;

        // 绑定事件，修复重复触发问题
        input.addEventListener('blur', () => {
            // 只有在没有通过按键触发的情况下才执行
            if (!this.renameTriggeredByKey) {
                this.confirmFileRename();
            }
            this.renameTriggeredByKey = false;
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.renameTriggeredByKey = true;
                this.confirmFileRename();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.renameTriggeredByKey = true;
                this.cancelFileRename();
            }
        });
    }

    // 确认文件重命名
    confirmFileRename() {
        if (!this.isRenamingFile || !this.selectedFileItem) return;

        const input = this.selectedFileItem.querySelector('.file-rename-input');
        const fileNameElement = this.selectedFileItem.querySelector('.file-name span:not(.icon)');
        const newFileName = input.value.trim();

        // 验证新文件名
        if (!newFileName) {
            this.showNotification('文件名不能为空', 'error');
            input.focus();
            return;
        }

        // 检查文件名是否包含非法字符
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(newFileName)) {
            this.showNotification('文件名包含非法字符', 'error');
            input.focus();
            return;
        }

        // 检查文件名是否已存在
        if (newFileName !== this.originalFileName) {
            const existingFiles = this.getAllFiles();
            if (existingFiles.some(file => file.name === newFileName)) {
                this.showNotification('文件名已存在', 'error');
                input.focus();
                return;
            }
        }

        // 执行重命名
        if (newFileName !== this.originalFileName) {
            this.renameFile(this.originalFileName, newFileName);
        }

        // 恢复界面
        this.finishFileRename(input, fileNameElement, newFileName);
    }

    // 取消文件重命名
    cancelFileRename() {
        if (!this.isRenamingFile || !this.selectedFileItem) return;

        const input = this.selectedFileItem.querySelector('.file-rename-input');
        const fileNameElement = this.selectedFileItem.querySelector('.file-name span:not(.icon)');

        this.finishFileRename(input, fileNameElement, this.originalFileName);
    }

    // 完成文件重命名
    finishFileRename(input, fileNameElement, displayName) {
        // 恢复显示
        fileNameElement.textContent = displayName;
        fileNameElement.style.display = '';

        // 移除输入框
        if (input && input.parentNode) {
            input.parentNode.removeChild(input);
        }

        // 重置状态
        this.isRenamingFile = false;
        this.originalFileName = null;

        // 刷新列表
        this.refreshFileList();
    }

    // 执行文件重命名
    renameFile(oldFileName, newFileName) {
        try {
            // 获取旧文件数据
            const oldStorageKey = oldFileName === '默认文件' ? 'behaviorTree' : `behaviorTree_${oldFileName}`;
            const fileData = localStorage.getItem(oldStorageKey);

            if (!fileData) {
                this.showNotification('文件不存在', 'error');
                return;
            }

            // 保存到新的存储键
            const newStorageKey = newFileName === '默认文件' ? 'behaviorTree' : `behaviorTree_${newFileName}`;
            localStorage.setItem(newStorageKey, fileData);

            // 删除旧的存储项
            localStorage.removeItem(oldStorageKey);

            // 如果重命名的是当前文件，更新当前文件名
            if (oldFileName === this.getCurrentFileName()) {
                this.currentFileName = newFileName;
                this.updateCurrentFileDisplay();
            }

            this.showNotification(`文件已重命名: "${oldFileName}" → "${newFileName}"`);
        } catch (error) {
            this.showNotification('重命名失败', 'error');
            console.error('文件重命名错误:', error);
        }
    }

    // 切换到选中的文件
    switchToSelectedFile() {
        if (!this.selectedFileItem) {
            this.showNotification('请先选中一个文件', 'error');
            return;
        }

        const fileName = this.selectedFileItem.dataset.filename;
        this.switchToFile(fileName);
    }

    // 删除选中的文件
    deleteSelectedFile() {
        if (!this.selectedFileItem) {
            this.showNotification('请先选中一个文件', 'error');
            return;
        }

        const fileName = this.selectedFileItem.dataset.filename;
        this.deleteFile(fileName);
    }

    // 切换到指定文件
    switchToFile(fileName) {
        if (fileName === this.getCurrentFileName()) {
            this.showNotification('已经是当前文件');
            this.closeFileManager();
            return;
        }

        // 保存当前文件状态
        this.saveToStorage();

        // 加载目标文件
        this.currentFileName = fileName;
        this.loadFromStorage();
        // 更新界面
        this.updateCurrentFileDisplay();
        this.refreshFileList();

        this.closeFileManager();
        this.showNotification(`已切换到文件: ${fileName}`);
    }

    // 删除指定文件
    deleteFile(fileName) {
        if (fileName === this.getCurrentFileName()) {
            this.showNotification('不能删除当前正在编辑的文件', 'error');
            return;
        }

        if (confirm(`确定要删除文件 "${fileName}" 吗？此操作不可撤销。`)) {
            const storageKey = `behaviorTree_${fileName}`;
            localStorage.removeItem(storageKey);

            this.refreshFileList();
            this.showNotification(`文件 "${fileName}" 已删除`);
        }
    }

    // 加载指定文件
    loadFile(fileName) {
        const storageKey = fileName === '默认文件' ? 'behaviorTree' : `behaviorTree_${fileName}`;
        const saved = localStorage.getItem(storageKey);

        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.loadData(data);
                this.nextNodeId = data.nextNodeId || this.nextNodeId;

                // 确保现有连接都有order字段
                this.ensureConnectionOrder();

                // 重置历史记录（每个文件独立的历史）
                this.history = [];
                this.historyIndex = -1;
                this.saveHistoryState('加载文件');

                // 简单定位到节点
                if (this.nodes.length > 0) {
                    this.centerViewOnNodes();
                }
            } catch (error) {
                this.showNotification('文件加载失败', 'error');
                console.error('文件加载错误:', error);
            }
        } else {
            // 文件不存在，创建空的编辑器状态
            this.clearEditor();
        }
    }

    // 清空编辑器
    clearEditor() {
        // 清空画布和数据
        this.canvas.innerHTML = '';
        this.connectionsSvg.innerHTML = '';
        this.nodes = [];
        this.connections = [];
        this.nextNodeId = 1;
        this.selectedNode = null;

        // 重置历史记录
        this.history = [];
        this.historyIndex = -1;

        // 更新界面
        this.updatePropertyPanel();
        this.updateStatus();
        this.validateAllNodes();
        this.resetConnectionMode();
    }

    // 加载上次使用的文件
    loadLastUsedFile() {
        // 从localStorage获取上次使用的文件名
        const lastUsedFile = localStorage.getItem('lastUsedFile');

        if (lastUsedFile) {
            // 检查该文件是否还存在
            const storageKey = lastUsedFile === '默认文件' ? 'behaviorTree' : `behaviorTree_${lastUsedFile}`;
            if (localStorage.getItem(storageKey)) {
                this.currentFileName = lastUsedFile === '默认文件' ? null : lastUsedFile;
                this.loadFromStorage();
                this.updateCurrentFileDisplay();
                console.log(`已自动加载上次使用的文件: ${lastUsedFile}`);
                return;
            } else {
                // 上次使用的文件不存在，清除记录
                localStorage.removeItem('lastUsedFile');
            }
        }

        // 没有上次使用的文件或文件不存在，加载默认文件
        this.currentFileName = null;
        this.loadFromStorage();
        this.updateCurrentFileDisplay();
    }

    // 记录当前使用的文件
    recordLastUsedFile() {
        const currentFile = this.getCurrentFileName();
        localStorage.setItem('lastUsedFile', currentFile);
    }

    // 设置黑板节点的按钮事件
    setupBlackboardEvents(nodeElement, node) {
        // 等待DOM元素完全创建
        setTimeout(() => {
            // 为增加按钮添加事件处理
            const addBtn = nodeElement.querySelector('.add-field-btn');

            if (addBtn) {
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // 阻止事件冒泡到节点拖动
                    this.addBlackboardField(node);
                });

                // 阻止按钮区域触发节点拖动
                addBtn.addEventListener('mousedown', (e) => {
                    e.stopPropagation();

                });
            }

            // 为删除按钮添加事件处理
            const removeButtons = nodeElement.querySelectorAll('.remove-field-btn');
            removeButtons.forEach((removeBtn, index) => {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // 阻止事件冒泡到节点拖动
                    this.removeBlackboardField(node, index);
                });

                // 阻止按钮区域触发节点拖动
                removeBtn.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                });
            });

            // 为输入框添加事件处理（阻止拖动）
            const inputs = nodeElement.querySelectorAll('.field-key, .field-value, .field-comment');
            inputs.forEach(input => {
                input.addEventListener('mousedown', (e) => {
                    e.stopPropagation(); // 阻止触发节点拖动
                });

                // 监听输入变化
                input.addEventListener('input', (e) => {
                    this.updateBlackboardField(node, input);
                });

                // 按下Enter键失去焦点
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    }
                });
            });
        }, 0);
    }

    // 添加黑板字段
    addBlackboardField(node) {
        // 初始化fields数组如果不存在
        if (!node.fields) {
            node.fields = [];
        }

        // 添加新字段
        node.fields.push({
            key: '',
            value: ''
        });

        // 更新节点显示
        this.updateSingleNodeDisplay(node);

        // 重新绑定事件
        const nodeElement = document.getElementById(`node-${node.id}`);
        if (nodeElement) {
            this.setupBlackboardEvents(nodeElement, node);
        }

        // 检查键重复
        this.checkBlackboardKeyDuplicates();

        // 重新绘制连线（因为节点尺寸可能发生变化）
        this.drawConnections();

        // 保存更改
        this.saveToStorage();
        this.saveHistoryState('添加黑板字段');
        this.showNotification('已添加新字段');
    }

    // 删除黑板字段
    removeBlackboardField(node, index) {
        if (!node.fields || index < 0 || index >= node.fields.length) {
            return;
        }

        // 删除指定字段
        node.fields.splice(index, 1);

        // 更新节点显示
        this.updateSingleNodeDisplay(node);

        // 重新绑定事件
        const nodeElement = document.getElementById(`node-${node.id}`);
        if (nodeElement) {
            this.setupBlackboardEvents(nodeElement, node);
        }

        // 重新绘制连线（因为节点尺寸可能发生变化）
        this.drawConnections();

        // 保存更改
        this.saveToStorage();
        this.saveHistoryState('删除黑板字段');
        this.showNotification('已删除字段');
    }

    // 更新黑板字段值
    updateBlackboardField(node, inputElement) {
        const fieldItem = inputElement.closest('.field-item');
        if (!fieldItem) return;

        const index = parseInt(fieldItem.dataset.index);
        if (!node.fields || index < 0 || index >= node.fields.length) {
            return;
        }

        const isKeyField = inputElement.classList.contains('field-key');
        const isValueField = inputElement.classList.contains('field-value');
        const isCommentField = inputElement.classList.contains('field-comment');
        const newValue = inputElement.value;

        if (isKeyField) {
            node.fields[index].key = newValue;
            // 检测键重复并更新样式
            this.checkBlackboardKeyDuplicates();
        } else if (isValueField) {
            node.fields[index].value = newValue;
        } else if (isCommentField) {
            node.fields[index].comment = newValue;
        }

        // 保存更改
        this.saveToStorage();

        // 延迟保存历史状态，避免频繁输入时产生过多历史记录
        clearTimeout(this.blackboardFieldSaveTimeout);
        this.blackboardFieldSaveTimeout = setTimeout(() => {
            this.saveHistoryState('修改黑板字段');
        }, 1000);
    }

    // 检查黑板中所有字段的键是否重复，如果重复就标红
    checkBlackboardKeyDuplicates() {
        // 收集所有黑板节点的所有字段键
        const allKeys = {};

        // 遍历所有黑板节点
        this.nodes.forEach(node => {
            if (node.type === 'BLACKBOARD' && node.fields) {
                node.fields.forEach((field, fieldIndex) => {
                    if (field.key && field.key.trim()) {
                        const key = field.key.trim();
                        if (!allKeys[key]) {
                            allKeys[key] = [];
                        }
                        allKeys[key].push({
                            nodeId: node.id,
                            fieldIndex: fieldIndex
                        });
                    }
                });
            }
        });

        // 清除所有字段的错误样式
        document.querySelectorAll('.field-key').forEach(input => {
            input.classList.remove('error', 'duplicate-key');
        });

        // 标记重复的键
        Object.keys(allKeys).forEach(key => {
            const occurrences = allKeys[key];
            if (occurrences.length > 1) {
                // 这个键出现了多次，标记所有相关的输入框
                occurrences.forEach(occurrence => {
                    const nodeElement = document.getElementById(`node-${occurrence.nodeId}`);
                    if (nodeElement) {
                        const fieldItem = nodeElement.querySelector(`[data-index="${occurrence.fieldIndex}"]`);
                        if (fieldItem) {
                            const keyInput = fieldItem.querySelector('.field-key');
                            if (keyInput) {
                                keyInput.classList.add('error', 'duplicate-key');
                                keyInput.title = `键名 "${key}" 重复，请修改为唯一键名`;
                            }
                        }
                    }
                });
            }
        });
    }

    // 更新单个节点显示
    updateSingleNodeDisplay(node) {
        const nodeElement = document.getElementById(`node-${node.id}`);
        if (nodeElement) {
            nodeElement.innerHTML = this.generateNodeHTML(node);
        }
    }

    // 检测和应用黑板引用样式
    isBlackboardReference(value) {
        if (!value || typeof value !== 'string') return false;
        // 检查是否是@开头但不是\@转义的格式
        return /^@[^@\s]+$/.test(value) && !value.startsWith('\\@');
    }

    // 检查黑板引用是否有效（键名是否存在于黑板中）
    isValidBlackboardReference(keyName) {
        // 获取所有黑板节点的字段
        for (const node of this.nodes) {
            if (node.type === 'BLACKBOARD' && node.fields) {
                for (const field of node.fields) {
                    if (field.key && field.key.trim() === keyName) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // 获取黑板中指定键的默认值
    getBlackboardDefaultValue(keyName) {
        for (const node of this.nodes) {
            if (node.type === 'BLACKBOARD' && node.fields) {
                for (const field of node.fields) {
                    if (field.key && field.key.trim() === keyName) {
                        return field.value || '';
                    }
                }
            }
        }
        return null;
    }

    // 更新所有输入框的黑板引用样式
    updateBlackboardReferences() {
        // 获取所有相关输入框（除了节点名称、位置、节点类型、注释说明）
        const inputs = document.querySelectorAll('#node-function, #node-policy, #repeater-count, #timeout-duration, #retry-count, #cooldown-duration, #subtree-reference, #wait-duration');

        inputs.forEach(input => {
            this.updateInputBlackboardStyle(input);
        });
    }

    // 获取所有子树节点的名称
    getAllSubtreeNames() {
        return this.nodes
            .filter(node => node.type === 'SUBTREE')
            .map(node => node.name)
            .filter(name => name && name.trim() !== '');
    }

    // 检查子树引用是否有效
    isValidSubtreeReference(subtreeName) {
        const availableSubtrees = this.getAllSubtreeNames();
        return availableSubtrees.includes(subtreeName);
    }

    // 验证引用子树装饰器的函数字段
    validateSubtreeReference(input, value) {
        if (!value || value.trim() === '') {
            input.title = '';
            return;
        }

        const trimmedValue = value.trim();

        // 如果是黑板引用，按黑板引用处理
        input.classList.remove('blackboard-reference', 'blackboard-reference-invalid');
        if (this.isBlackboardReference(trimmedValue)) {
            const keyName = trimmedValue.substring(1);
            if (this.isValidBlackboardReference(keyName)) {
                input.classList.add('blackboard-reference');
                input.title = `黑板引用: ${keyName}`;
            } else {
                input.classList.add('blackboard-reference-invalid');
                input.title = `无效的黑板引用: ${keyName} (键名不存在)`;
            }
            return;
        }

        // 验证子树引用
        if (this.isValidSubtreeReference(trimmedValue)) {
            input.title = `引用子树: ${trimmedValue}`;
        } else {
            input.classList.add('subtree-reference-invalid');
            const availableSubtrees = this.getAllSubtreeNames();
            if (availableSubtrees.length > 0) {
                input.title = `无效的子树引用: ${trimmedValue}\n可用的子树: ${availableSubtrees.join(', ')}`;
            } else {
                input.title = `无效的子树引用: ${trimmedValue}\n当前没有可用的子树节点`;
            }
        }
    }

    // 验证引用子树名称字段
    validateSubtreeReferenceName(input, value) {
        if (!value || value.trim() === '') {
            input.title = '';
            return;
        }

        const trimmedValue = value.trim();

        // 如果是黑板引用，按黑板引用处理
        input.classList.remove('blackboard-reference', 'blackboard-reference-invalid');
        if (this.isBlackboardReference(trimmedValue)) {
            const keyName = trimmedValue.substring(1);
            if (this.isValidBlackboardReference(keyName)) {
                input.classList.add('blackboard-reference');
                input.title = `黑板引用: ${keyName}`;
            } else {
                input.classList.add('blackboard-reference-invalid');
                input.title = `无效的黑板引用: ${keyName} (键名不存在)`;
            }
            return;
        }

        // 验证子树引用
        if (this.isValidSubtreeReference(trimmedValue)) {
            input.title = `引用子树: ${trimmedValue}`;
        } else {
            input.classList.add('subtree-reference-invalid');
            const availableSubtrees = this.getAllSubtreeNames();
            if (availableSubtrees.length > 0) {
                input.title = `无效的子树引用: ${trimmedValue}\n可用的子树: ${availableSubtrees.join(', ')}`;
            } else {
                input.title = `无效的子树引用: ${trimmedValue}\n当前没有可用的子树节点`;
            }
        }
    }

    // 更新单个输入框的黑板引用样式
    updateInputBlackboardStyle(input) {
        const value = input.value;

        // 清除之前的样式
        input.classList.remove('blackboard-reference', 'blackboard-reference-invalid', 'number-validation-error', 'subtree-reference-invalid');

        // 检查是否是引用子树装饰器的函数字段
        if (input.id === 'node-function' && this.selectedNode &&
            this.selectedNode.type === 'DECORATOR' &&
            this.selectedNode.decoratorType === 'SUBTREE_REF') {
            this.validateSubtreeReference(input, value);
            return;
        }

        // 检查是否是引用子树名称字段
        if (input.id === 'subtree-reference') {
            this.validateSubtreeReferenceName(input, value);
            return;
        }

        // 优先检查黑板引用
        input.classList.remove('blackboard-reference', 'blackboard-reference-invalid');
        if (this.isBlackboardReference(value)) {
            const keyName = value.substring(1); // 去掉@符号
            if (this.isValidBlackboardReference(keyName)) {
                input.classList.add('blackboard-reference');
                input.title = `黑板引用: ${keyName}`;
            } else {
                input.classList.add('blackboard-reference-invalid');
                input.title = `无效的黑板引用: ${keyName} (键名不存在)`;
            }
        } else {
            // 检查是否需要数字验证
            if (this.shouldValidateAsNumber(input)) {
                this.validateNumberInput(input, value);
            } else {
                // 清空提示
                input.title = '';
            }
        }
    }

    // 判断输入框是否需要数字验证
    shouldValidateAsNumber(input) {
        const numericFields = ['repeater-count', 'timeout-duration', 'retry-count', 'cooldown-duration', 'wait-duration'];
        return numericFields.includes(input.id);
    }

    // 验证数字输入
    validateNumberInput(input, value) {
        if (!value || value.trim() === '') {
            input.title = '';
            return; // 空值不验证，允许为空
        }

        const trimmedValue = value.trim();
        let isValid = false;
        let errorMessage = '';

        switch (input.id) {
            case 'repeater-count':
                // 重复次数：整数，-1表示无限重复
                isValid = /^-?\d+$/.test(trimmedValue) && parseInt(trimmedValue) >= -1;
                errorMessage = '重复次数必须是大于等于-1的整数（-1表示无限重复）';
                break;

            case 'timeout-duration':
                // 超时时间：正数，支持小数
                isValid = /^\d+(\.\d+)?$/.test(trimmedValue) && parseFloat(trimmedValue) > 0;
                errorMessage = '超时时间必须是大于0的数字';
                break;

            case 'retry-count':
                // 重试次数：正整数
                isValid = /^\d+$/.test(trimmedValue) && parseInt(trimmedValue) >= 1;
                errorMessage = '重试次数必须是大于等于1的整数';
                break;

            case 'cooldown-duration':
                // 冷却时间：非负数，支持小数
                isValid = /^\d+(\.\d+)?$/.test(trimmedValue) && parseFloat(trimmedValue) >= 0;
                errorMessage = '冷却时间必须是大于等于0的数字';
                break;

            case 'wait-duration':
                // 冷却时间：非负数，支持小数
                isValid = /^\d+(\.\d+)?$/.test(trimmedValue) && parseFloat(trimmedValue) >= 0;
                errorMessage = '等待时间必须是大于等于0的数字';
                break;
        }

        if (!isValid) {
            input.classList.add('number-validation-error');
            input.title = errorMessage;
        } else {
            input.title = '';
        }
    }

    // 格式化黑板引用输出为Lua格式
    formatBlackboardReference(value, forLua = false) {
        if (!this.isBlackboardReference(value)) {
            // 处理转义的@符号
            if (value && value.startsWith('\\@')) {
                return value.substring(1); // 移除转义符，保留@
            }
            return value;
        }

        const keyName = value.substring(1); // 去掉@符号

        if (forLua) {
            // 生成Lua格式的黑板引用
            const defaultValue = this.getBlackboardDefaultValue(keyName);
            if (defaultValue !== null && defaultValue !== '') {
                return `{BT.MessageType.BLACKBOARD, "${keyName}", ${this.formatLuaValue(defaultValue)}}`;
            } else {
                return `{BT.MessageType.BLACKBOARD, "${keyName}"}`;
            }
        } else {
            return value; // 保持原格式
        }
    }

    // 格式化Lua值
    formatLuaValue(value) {
        if (!value || value === '') return '""';

        // 如果是数字
        if (!isNaN(value) && !isNaN(parseFloat(value))) {
            return parseFloat(value).toString();
        }

        // 如果是布尔值
        if (value.toLowerCase() === 'true') return 'true';
        if (value.toLowerCase() === 'false') return 'false';

        // 默认作为字符串处理
        return `"${value.replace(/"/g, '\\"')}"`;
    }

    // ===============================
    // 节点复制功能相关方法
    // ===============================

    // 复制选中的节点
    copyNode() {
        if (!this.selectedNode) {
            this.showNotification('请先选择要复制的节点', 'error');
            return;
        }

        // 深度复制节点数据
        this.copiedNode = JSON.parse(JSON.stringify(this.selectedNode));

        this.showNotification(`节点 "${this.selectedNode.name}" 已复制`);
    }

    // 粘贴节点
    pasteNode() {
        if (!this.copiedNode) {
            this.showNotification('没有复制的节点', 'error');
            return;
        }

        // 获取鼠标位置或使用默认位置
        let pasteX, pasteY;

        // 默认位置：在原节点右侧偏移50像素
        pasteX = this.copiedNode.x + 50;
        pasteY = this.copiedNode.y + 50;

        // 边界检查，确保粘贴位置在画布范围内
        pasteX = Math.max(-2000, Math.min(1820, pasteX));
        pasteY = Math.max(-2000, Math.min(1920, pasteY));

        // 创建新节点
        const newNode = {
            ...this.copiedNode,
            id: this.nextNodeId++,
            x: pasteX,
            y: pasteY,
            name: this.generateUniqueNodeName(this.copiedNode.name)
        };

        // 创建节点元素并添加到画布
        const nodeElement = this.createNodeElement(newNode);
        this.canvas.appendChild(nodeElement);
        this.nodes.push(newNode);

        // 选中新创建的节点
        this.selectNode(newNode);

        // 更新界面
        this.updateNodeDisplay();
        this.validateAllNodes();
        this.updateStatus();
        this.saveToStorage();
        this.saveHistoryState('粘贴节点');

        this.showNotification(`节点 "${newNode.name}" 已粘贴`);
    }

    // 生成唯一的节点名称
    generateUniqueNodeName(originalName) {
        let baseName = originalName;
        let counter = 1;

        // 如果原始名称已经包含"_副本"，则提取基础名称
        const copyMatch = originalName.match(/^(.+)_副本(\d*)$/);
        if (copyMatch) {
            baseName = copyMatch[1];
            counter = copyMatch[2] ? parseInt(copyMatch[2]) + 1 : 2;
        }

        // 生成新名称并检查是否已存在
        let newName = `${baseName}_副本${counter > 1 ? counter : ''}`;

        while (this.nodes.some(node => node.name === newName)) {
            counter++;
            newName = `${baseName}_副本${counter}`;
        }

        return newName;
    }

    // 更新鼠标位置（用于粘贴位置计算）
    updateMousePosition(e) {
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }

    // ===============================
    // 参数管理相关方法
    // ===============================

    // 初始化参数界面
    initializeParamsUI() {
        if (!this.selectedNode || !(['CONDITION', 'ACTION'].includes(this.selectedNode.type) || ['CONDITION_INTERRUPT'].includes(this.selectedNode.decoratorType))) {
            return;
        }

        // 确保节点有参数数组
        if (!this.selectedNode.params) {
            this.selectedNode.params = [];
        }

        this.renderParamsList();
    }

    // 渲染参数列表
    renderParamsList() {
        const paramsContainer = document.getElementById('params-list');
        if (!paramsContainer || !this.selectedNode) return;

        const params = this.selectedNode.params || [];

        if (params.length === 0) {
            paramsContainer.innerHTML = `
            <div class="params-list" id="params-list">
                <!-- 参数列表动态生成 -->
                <div class="no-params-hint" id="no-params-hint">
                    暂无参数，点击上方 + 按钮添加参数
                </div>
            </div>
        `;
        } else {
            paramsContainer.innerHTML = `
                ${params.map((param, index) => this.renderParameterItem(param, index)).join('')}
            `;
        }
    }

    // 渲染单个参数项
    renderParameterItem(param, index) {
        return `
            <div class="param-item" data-index="${index}">
                    <input type="text" class="param-name" value="${param.name || ''}" 
                           placeholder="键" oninput="bte.updateParameter(this, ${index}, 'name')">
                    <input type="text" class="param-value" value='${param.value || ''}' 
                           placeholder="值" 
                           oninput="bte.updateParameter(this, ${index}, 'value')">
                    <button class="remove-param-btn" onclick="bte.removeParameter(${index})" title="删除参数">×</button>
            </div>
        `;
    }

    // 添加参数
    addParameter() {
        console.log(!this.selectedNode, !['CONDITION', 'ACTION'].includes(this.selectedNode.type), !['CONDITION_INTERRUPT'].includes(this.selectedNode.decoratorType));

        if (!(this.selectedNode && (['CONDITION', 'ACTION'].includes(this.selectedNode.type) || ['CONDITION_INTERRUPT'].includes(this.selectedNode.decoratorType)))) {
            return;
        }

        if (!this.selectedNode.params) {
            this.selectedNode.params = [];
        }

        // 添加新参数
        this.selectedNode.params.push({
            name: '',
            value: '',
        });

        // 重新渲染参数列表
        this.renderParamsList();

        // 保存更改
        this.saveToStorage();
        this.saveHistoryState('添加参数');
        this.showNotification('已添加新参数');
    }

    // 更新参数
    updateParameter(obj, index, field) {
        if (!this.selectedNode || !this.selectedNode.params || index < 0 || index >= this.selectedNode.params.length) {
            return;
        }

        const trimmedValue = obj.value.trim();
        obj.classList.remove('blackboard-reference', 'blackboard-reference-invalid');
        if (this.isBlackboardReference(trimmedValue) && (field !== "name")) {
            const keyName = trimmedValue.substring(1);
            if (this.isValidBlackboardReference(keyName)) {
                obj.classList.add('blackboard-reference');
                obj.title = `黑板引用: ${keyName}`;
            } else {
                obj.classList.add('blackboard-reference-invalid');
                obj.title = `无效的黑板引用: ${keyName} (键名不存在)`;
            }
        } else {
            obj.classList.remove('blackboard-reference', 'blackboard-reference-invalid');
        }

        const oldValue = this.selectedNode.params[index][field];
        this.selectedNode.params[index][field] = obj.value;

        // 如果类型改变，重新渲染当前参数项
        if (field === 'type' && oldValue !== obj.value) {
            this.renderParamsList();
        }

        // 保存更改
        this.saveToStorage();

        // 延迟保存历史状态，避免频繁输入时产生过多历史记录
        clearTimeout(this.paramUpdateTimeout);
        this.paramUpdateTimeout = setTimeout(() => {
            this.saveHistoryState('修改参数');
        }, 1000);
    }

    // 删除参数
    removeParameter(index) {
        if (!this.selectedNode || !this.selectedNode.params || index < 0 || index >= this.selectedNode.params.length) {
            return;
        }

        // 删除参数
        this.selectedNode.params.splice(index, 1);

        // 重新渲染参数列表
        this.renderParamsList();

        // 保存更改
        this.saveToStorage();
        this.saveHistoryState('删除参数');
        this.showNotification('参数已删除');
    }
}

bte = new BehaviorTreeEditor();

// 为所有相关输入框添加黑板引用检测
document.addEventListener('DOMContentLoaded', () => {
    const inputs = document.querySelectorAll('#node-function, #node-policy, #repeater-count, #timeout-duration, #retry-count, #cooldown-duration, #subtree-reference, #wait-duration');

    inputs.forEach(input => {
        input.addEventListener('input', () => {
            if (bte.selectedNode) {
                bte.updateInputBlackboardStyle(input);
            }
        });
    });
});
