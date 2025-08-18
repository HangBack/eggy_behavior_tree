require "behavior.tree"

---@class AIConfig
AIConfig = {}

-- 根据配置构建行为树
---@return BehaviorTree
function AIConfig.build_tree(config)
    local builder = BT.TreeBuilder:new() --[[@as TreeBuilder]]
    local node = AIConfig.build_node(builder, config) --[[@as BaseNode]]
    local tree = builder:build(node)
    return tree
end

---@param builder TreeBuilder
---@param config table
---@return BaseNode?
function AIConfig.build_node(builder, config)
    if config.type == BT.NodeType.SEQUENCE then
        builder:sequence(config.name)
    elseif config.type == BT.NodeType.FALLBACK then
        builder:fallback(config.name)
    elseif config.type == BT.NodeType.PARALLEL then
        -- 支持黑板引用的policy配置
        builder:parallel(config.name, config.policy)
    elseif config.type == BT.NodeType.INVERTER then
        builder:inverter(config.name)
    elseif config.type == BT.NodeType.REPEATER then
        -- 支持黑板引用的count配置
        builder:repeater(config.name, config.count)
    elseif config.type == BT.NodeType.TIMEOUT then
        -- 支持黑板引用的duration配置
        builder:timeout(config.name, config.duration)
    elseif config.type == BT.NodeType.RETRY then
        -- 支持黑板引用的max_retries配置
        builder:retry(config.name, config.max_retries)
    elseif config.type == BT.NodeType.COOLDOWN then
        -- 支持黑板引用的duration配置
        builder:cooldown(config.name, config.duration)
    elseif config.type == BT.NodeType.ALWAYS_SUCCESS then
        builder:always_success(config.name)
    elseif config.type == BT.NodeType.ALWAYS_FAILURE then
        builder:always_failure(config.name)
    elseif config.type == BT.NodeType.UNTIL_SUCCESS then
        builder:until_success(config.name)
    elseif config.type == BT.NodeType.UNTIL_FAILURE then
        builder:until_failure(config.name)
    elseif config.type == BT.NodeType.ACTION then
        builder:action(config.name, config.func)
        return
    elseif config.type == BT.NodeType.CONDITION then
        builder:condition(config.name, config.func)
        return
    end

    if config.children then
        for _, child in ipairs(config.children) do
            AIConfig.build_node(builder, child)
        end
    end
    local result = builder:end_node()
    if #builder.node_stack == 0 then
        return result
    end
end
