require "behavior.node"
---@class Blackboard : Class
---@field data table<string, any>
-- 黑板类 - 用于存储和共享数据
local Blackboard = Class("Blackboard")
BT.Frameout = SetFrameOut(1, function() end, -1, true)

function Blackboard:init()
    self.data = {}
end

function Blackboard:set(key, value)
    self.data[key] = value
end

function Blackboard:get(key, default)
    return self.data[key] or default
end

function Blackboard:has(key)
    return self.data[key] ~= nil
end

function Blackboard:remove(key)
    self.data[key] = nil
end

function Blackboard:clear()
    self.data = {}
end

-- 行为树类
---@class BehaviorTree : Class
---@field root BaseNode 根节点
---@field blackboard Blackboard 黑板
---@field is_running boolean 是否正在运行
local BehaviorTree = Class("BehaviorTree")

function BehaviorTree:init(root_node)
    self.root = root_node
    self.blackboard = Blackboard:new()
    self.is_running = false

    if self.root then
        self.root:set_blackboard(self.blackboard)
    end
end

function BehaviorTree:set_root(root_node)
    self.root = root_node
    if self.root then
        self.root:set_blackboard(self.blackboard)
    end
end

function BehaviorTree:tick()
    if not self.root then
        return BT.Status.FAILURE
    end

    self.is_running = true
    local status = self.root:execute()

    if status ~= BT.Status.RUNNING then
        self.is_running = false
        self.root:reset()
    end

    return status
end

function BehaviorTree:reset()
    if self.root then
        self.root:reset()
    end
    self.is_running = false
end

---@return Blackboard
function BehaviorTree:get_blackboard()
    return self.blackboard
end

-- 行为树构建器
---@class TreeBuilder : Class
---@field node_stack BaseNode[] 节点栈
---@field blackboard Blackboard 黑板
---@field root_node Node 根节点
local TreeBuilder = Class("TreeBuilder")

function TreeBuilder:init()
    self.node_stack = {}
end

function TreeBuilder:sequence(name)
    local node = BT.SequenceNode:new(name)
    self:push_node(node)
    return self
end

function TreeBuilder:fallback(name)
    local node = BT.FallbackNode:new(name)
    self:push_node(node)
    return self
end

function TreeBuilder:parallel(name, policy)
    local node = BT.ParallelNode:new(name, policy)
    self:push_node(node)
    return self
end

function TreeBuilder:inverter(name)
    local node = BT.InverterNode:new(name)
    self:push_node(node)
    return self
end

function TreeBuilder:repeater(name, count)
    local node = BT.RepeaterNode:new(name, count)
    self:push_node(node)
    return self
end

function TreeBuilder:timeout(name, duration)
    local node = BT.TimeoutNode:new(name, duration)
    self:push_node(node)
    return self
end

function TreeBuilder:retry(name, max_retries)
    local node = BT.RetryNode:new(name, max_retries)
    self:push_node(node)
    return self
end

function TreeBuilder:cooldown(name, duration)
    local node = BT.CooldownNode:new(name, duration)
    self:push_node(node)
    return self
end

function TreeBuilder:always_success(name)
    local node = BT.AlwaysSuccessNode:new(name)
    self:push_node(node)
    return self
end

function TreeBuilder:always_failure(name)
    local node = BT.AlwaysFailureNode:new(name)
    self:push_node(node)
    return self
end

function TreeBuilder:until_success(name)
    local node = BT.UntilSuccessNode:new(name)
    self:push_node(node)
    return self
end

function TreeBuilder:until_failure(name)
    local node = BT.UntilFailureNode:new(name)
    self:push_node(node)
    return self
end

function TreeBuilder:action(name, func)
    local node = BT.ActionNode:new(name, func)
    self:add_leaf(node)
    return self
end

function TreeBuilder:condition(name, func)
    local node = BT.ConditionNode:new(name, func)
    self:add_leaf(node)
    return self
end

function TreeBuilder:push_node(node)
    if #self.node_stack > 0 then
        local parent = self.node_stack[#self.node_stack]
        parent:add_child(node)
    end
    table.insert(self.node_stack, node)
end

function TreeBuilder:add_leaf(node)
    if #self.node_stack > 0 then
        local parent = self.node_stack[#self.node_stack]
        parent:add_child(node)
    else
        table.insert(self.node_stack, node)
    end
end

function TreeBuilder:end_node()
    if #self.node_stack > 0 then
        return table.remove(self.node_stack)
    end
end

---@param node BaseNode
---@return BehaviorTree?
function TreeBuilder:build(node)
    return BehaviorTree:new(node)
end

-- 导出类
BT.Blackboard = Blackboard
BT.BehaviorTree = BehaviorTree
BT.TreeBuilder = TreeBuilder
