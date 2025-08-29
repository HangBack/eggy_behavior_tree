require "ClassUtils"
require "behavior.tree"

---@class AIConfig
AIConfig = {}

-- 子树缓存，避免重复构建
AIConfig.subtree_cache = {}

-- 根据配置构建行为树
---@param config table 配置表，包含根节点和subtrees
---@return BehaviorTree
function AIConfig.build_tree(config)
    -- 清空子树缓存
    AIConfig.subtree_cache = {}

    -- 先构建所有子树
    if config.subtrees then
        for tree_name, subtree_config in pairs(config.subtrees) do
            local builder = BT.TreeBuilder:new()
            local subtree_root = AIConfig.build_node(builder, subtree_config, config.subtrees)
            AIConfig.subtree_cache[tree_name] = subtree_root
        end
    end

    -- 构建主树
    local builder = BT.TreeBuilder:new()
    local node = AIConfig.build_node(builder, config, config.subtrees)
    local tree = builder:build(node)

    return tree
end

---@param builder TreeBuilder
---@param config table
---@param subtrees table? 子树配置表
---@return BaseNode?
function AIConfig.build_node(builder, config, subtrees)
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
        builder:repeater(config.name, config.repeater_count)
    elseif config.type == BT.NodeType.TIMEOUT then
        -- 支持黑板引用的duration配置
        builder:timeout(config.name, config.timeout_duration)
    elseif config.type == BT.NodeType.RETRY then
        -- 支持黑板引用的max_retries配置
        builder:retry(config.name, config.max_retries)
    elseif config.type == BT.NodeType.COOLDOWN then
        -- 支持黑板引用的duration配置
        builder:cooldown(config.name, config.cooldown_duration)
    elseif config.type == BT.NodeType.ALWAYS_SUCCESS then
        builder:always_success(config.name)
    elseif config.type == BT.NodeType.ALWAYS_FAILURE then
        builder:always_failure(config.name)
    elseif config.type == BT.NodeType.UNTIL_SUCCESS then
        builder:until_success(config.name)
    elseif config.type == BT.NodeType.UNTIL_FAILURE then
        builder:until_failure(config.name)
    elseif config.type == BT.NodeType.WAIT then
        -- 支持黑板引用的wait_duration配置
        builder:wait(config.name, config.wait_duration)
    elseif config.type == BT.NodeType.ONCE then
        -- 一次性装饰器节点
        builder:once(config.name)
    elseif config.type == BT.NodeType.ASYNC_WAITER then
        -- 异步等待器装饰器节点
        builder:async_waiter(config.name, config.async_wait_duration)
    elseif config.type == BT.NodeType.ACTION then
        builder:action(config.name, config.func, config.params)
        return
    elseif config.type == BT.NodeType.CONDITION then
        builder:condition(config.name, config.func, config.params)
        return
    elseif config.type == BT.NodeType.SUBTREE_REF then
        -- 处理子树引用装饰器节点
        builder:subtree_ref(config.name, config.subtree_name)

        -- 获取当前构建的节点并动态构建子树
        local current_node = builder.node_stack[#builder.node_stack]
        if subtrees and subtrees[config.subtree_name] then
            -- 动态构建子树，避免deep_copy造成循环引用
            local subtree_builder = BT.TreeBuilder:new()
            local subtree_root = AIConfig.build_node(subtree_builder, subtrees[config.subtree_name], subtrees)
            if subtree_root then
                current_node:set_subtree_root(subtree_root)
            end
        else
            BT.Utils.log("Warning: Subtree '" .. (config.subtree_name or "unknown") .. "' not found")
        end
    end

    if config.children then
        for _, child in ipairs(config.children) do
            AIConfig.build_node(builder, child, subtrees)
        end
    end
    local result = builder:end_node()
    if #builder.node_stack == 0 then
        return result
    end
end

-- 获取子树根节点
---@param subtree_name string 子树名称
---@param subtrees table? 子树配置表
---@return BaseNode?
function AIConfig.get_subtree_root(subtree_name, subtrees)
    -- 先从缓存中查找
    if AIConfig.subtree_cache[subtree_name] then
        return AIConfig.subtree_cache[subtree_name]
    end

    -- 如果缓存中没有，尝试从subtrees配置中构建
    if subtrees and subtrees[subtree_name] then
        local builder = BT.TreeBuilder:new()
        local subtree_root = AIConfig.build_node(builder, subtrees[subtree_name], subtrees)
        AIConfig.subtree_cache[subtree_name] = subtree_root
        return subtree_root
    end

    return nil
end
