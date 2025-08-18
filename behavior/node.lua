require "behavior.utils"

---@class BaseNodeConfig
---@field type BT.NodeType 节点类型
---@field name string 节点名称

---@alias NodeConfig SequenceNodeConfig | FallbackNodeConfig | ParallelNodeConfig | ConditionNodeConfig | ActionNodeConfig | DecoratorNodeConfig

-- 基础节点类
---@class BaseNode : Class
---@field name string 节点名称
---@field parent BaseNode? 父节点
---@field children BaseNode[] 子节点
---@field status string 节点状态
---@field blackboard Blackboard 黑板数据
local BaseNode = Class("BaseNode")

function BaseNode:init(name)
    self.name = name or "UnnamedNode"
    self.parent = nil
    self.children = {}
    self.status = BT.Status.FAILURE
    self.blackboard = nil
end

function BaseNode:add_child(child)
    table.insert(self.children, child)
    child.parent = self
    child.blackboard = self.blackboard
    return self
end

function BaseNode:set_blackboard(blackboard)
    self.blackboard = blackboard
    for _, child in ipairs(self.children) do
        child:set_blackboard(blackboard)
    end
end

-- 虚方法，子类需要重写
---@return BT.Status
function BaseNode:execute()
    return BT.Status.FAILURE
end

function BaseNode:reset()
    self.status = BT.Status.FAILURE
    for _, child in ipairs(self.children) do
        child:reset()
    end
end

---@class SequenceNodeConfig : BaseNodeConfig
---@field type "SEQUENCE"
---@field children BaseNodeConfig[] 子节点配置

-- Sequence节点 - 顺序执行，全部成功才成功
---@class SequenceNode : BaseNode
---@field current_child integer 当前执行的子节点索引
local SequenceNode = Class("SequenceNode", BaseNode)

function SequenceNode:init(name)
    BaseNode.init(self, name)
    self.current_child = 1
end

function SequenceNode:execute()
    for i = self.current_child, #self.children do
        local child = self.children[i]
        local status = child:execute()

        if status == BT.Status.RUNNING then
            self.current_child = i
            return BT.Status.RUNNING
        elseif status == BT.Status.FAILURE then
            self:reset()
            return BT.Status.FAILURE
        end
    end

    self:reset()
    return BT.Status.SUCCESS
end

function SequenceNode:reset()
    BaseNode.reset(self)
    self.current_child = 1
end

---@class FallbackNodeConfig : BaseNodeConfig
---@field type "FALLBACK"
---@field children BaseNodeConfig[] 子节点配置

-- Fallback节点 - 选择执行，一个成功就成功
---@class FallbackNode : BaseNode
---@field current_child integer 当前执行的子节点索引
local FallbackNode = Class("FallbackNode", BaseNode)

function FallbackNode:init(name)
    BaseNode.init(self, name)
    self.current_child = 1
end

function FallbackNode:execute()
    for i = self.current_child, #self.children do
        local child = self.children[i]
        local status = child:execute()

        if status == BT.Status.RUNNING then
            self.current_child = i
            return BT.Status.RUNNING
        elseif status == BT.Status.SUCCESS then
            self:reset()
            return BT.Status.SUCCESS
        end
    end

    self:reset()
    return BT.Status.FAILURE
end

function FallbackNode:reset()
    BaseNode.reset(self)
    self.current_child = 1
end

---@class ParallelNodeConfig : BaseNodeConfig
---@field type "PARALLEL"
---@field policy BT.ParallelPolicy 并行策略
---@field children BaseNodeConfig[] 子节点配置

-- Parallel节点 - 并行执行
---@class ParallelNode : BaseNode
---@field policy BT.ParallelPolicy 并行策略
local ParallelNode = Class("ParallelNode", BaseNode)

function ParallelNode:init(name, policy)
    BaseNode.init(self, name)
    BT.Utils.set_node_property(self, "policy", policy or BT.ParallelPolicy.REQUIRE_ALL)
end

function ParallelNode:execute()
    local success_count = 0
    local failure_count = 0
    local running_count = 0

    for _, child in ipairs(self.children) do
        local status = child:execute()

        if status == BT.Status.SUCCESS then
            success_count = success_count + 1
        elseif status == BT.Status.FAILURE then
            failure_count = failure_count + 1
        else
            running_count = running_count + 1
        end
    end

    -- 根据策略判断结果
    local policy = BT.Utils.get_node_property(self, "policy")
    if policy == BT.ParallelPolicy.REQUIRE_ONE then
        if success_count > 0 then
            return BT.Status.SUCCESS
        elseif running_count > 0 then
            return BT.Status.RUNNING
        else
            return BT.Status.FAILURE
        end
    else -- REQUIRE_ALL
        if failure_count > 0 then
            return BT.Status.FAILURE
        elseif success_count == #self.children then
            return BT.Status.SUCCESS
        else
            return BT.Status.RUNNING
        end
    end
end

---@class DecoratorNodeConfig : BaseNodeConfig
---@field type "DECORATOR"
---@field children {[1]: BaseNodeConfig} 只有一个子节点

-- Decorator节点 - 装饰器基类
---@class DecoratorNode : BaseNode
---@field children BaseNode[] 只有一个子节点
local DecoratorNode = Class("DecoratorNode", BaseNode)

function DecoratorNode:init(name)
    BaseNode.init(self, name)
end

function DecoratorNode:execute()
    if #self.children > 0 then
        return self:decorate(self.children[1]:execute())
    end
    return BT.Status.FAILURE
end

-- 子类需要重写此方法
---@param child_status BT.Status
---@return BT.Status
function DecoratorNode:decorate(child_status)
    return child_status
end

-- Inverter装饰器 - 反转结果
---@class InverterNode : DecoratorNode
local InverterNode = Class("InverterNode", DecoratorNode)

function InverterNode:decorate(child_status)
    if child_status == BT.Status.SUCCESS then
        return BT.Status.FAILURE
    elseif child_status == BT.Status.FAILURE then
        return BT.Status.SUCCESS
    end
    return child_status
end

-- Repeater装饰器 - 重复执行
---@class RepeaterNode : DecoratorNode
---@field repeat_count integer 重复次数
---@field current_count integer 当前重复次数
local RepeaterNode = Class("RepeaterNode", DecoratorNode)

function RepeaterNode:init(name, count)
    DecoratorNode.init(self, name)
    BT.Utils.set_node_property(self, "repeat_count", count or -1) -- -1表示无限重复
    self.current_count = 0
end

function RepeaterNode:decorate(child_status)
    if child_status ~= BT.Status.RUNNING then
        self.current_count = self.current_count + 1
        
        local repeat_count = BT.Utils.get_node_property(self, "repeat_count")
        if repeat_count > 0 and self.current_count >= repeat_count then
            self.current_count = 0
            return child_status
        else
            -- 重置子节点继续执行
            if #self.children > 0 then
                self.children[1]:reset()
            end
            return BT.Status.RUNNING
        end
    end
    return child_status
end

-- Timeout装饰器 - 超时控制
---@class TimeoutNode : DecoratorNode
---@field timeout_duration number 超时时间（秒）
---@field start_time number? 开始执行时间
local TimeoutNode = Class("TimeoutNode", DecoratorNode)

function TimeoutNode:init(name, timeout_duration)
    DecoratorNode.init(self, name)
    BT.Utils.set_node_property(self, "timeout_duration", timeout_duration or 5.0)
    self.start_time = nil
end

function TimeoutNode:execute()
    if #self.children == 0 then
        return BT.Status.FAILURE
    end

    -- 记录开始时间
    if not self.start_time then
        self.start_time = BT.Frameout.frame
    end

    -- 检查是否超时
    local current_time = BT.Frameout.frame
    local timeout_duration = BT.Utils.get_node_property(self, "timeout_duration")
    if (current_time - self.start_time) >= (timeout_duration * 30) then
        self:reset()
        return BT.Status.FAILURE
    end

    local child_status = self.children[1]:execute()

    -- 如果子节点完成（成功或失败），重置计时器
    if child_status ~= BT.Status.RUNNING then
        self.start_time = nil
    end

    return child_status
end

function TimeoutNode:reset()
    DecoratorNode.reset(self)
    self.start_time = nil
end

-- Retry装饰器 - 重试节点
---@class RetryNode : DecoratorNode
---@field max_retries integer 最大重试次数
---@field current_retries integer 当前重试次数
local RetryNode = Class("RetryNode", DecoratorNode)

function RetryNode:init(name, max_retries)
    DecoratorNode.init(self, name)
    BT.Utils.set_node_property(self, "max_retries", max_retries or 3)
    self.current_retries = 0
end

function RetryNode:decorate(child_status)
    if child_status == BT.Status.SUCCESS then
        self.current_retries = 0
        return BT.Status.SUCCESS
    elseif child_status == BT.Status.FAILURE then
        self.current_retries = self.current_retries + 1
        
        local max_retries = BT.Utils.get_node_property(self, "max_retries")
        if self.current_retries >= max_retries then
            self.current_retries = 0
            return BT.Status.FAILURE
        else
            -- 重置子节点重试
            if #self.children > 0 then
                self.children[1]:reset()
            end
            return BT.Status.RUNNING
        end
    end
    return child_status -- RUNNING
end

function RetryNode:reset()
    DecoratorNode.reset(self)
    self.current_retries = 0
end

-- Cooldown装饰器 - 冷却节点
---@class CooldownNode : DecoratorNode
---@field cooldown_duration number 冷却时间（秒）
---@field last_success_time number? 上次成功时间
local CooldownNode = Class("CooldownNode", DecoratorNode)

function CooldownNode:init(name, cooldown_duration)
    DecoratorNode.init(self, name)
    BT.Utils.set_node_property(self, "cooldown_duration", cooldown_duration or 1.0)
    self.last_success_time = nil
end

function CooldownNode:execute()
    if #self.children == 0 then
        return BT.Status.FAILURE
    end

    -- 检查是否在冷却期
    if self.last_success_time then
        local current_time = BT.Frameout.frame
        local cooldown_duration = BT.Utils.get_node_property(self, "cooldown_duration")
        if (current_time - self.last_success_time) < (cooldown_duration * 30) then
            return BT.Status.FAILURE
        end
    end

    local child_status = self.children[1]:execute()

    -- 如果子节点成功，记录成功时间
    if child_status == BT.Status.SUCCESS then
        self.last_success_time = BT.Frameout.frame
    end

    return child_status
end

function CooldownNode:reset()
    DecoratorNode.reset(self)
    -- 注意：不重置 last_success_time，保持冷却状态
end

-- AlwaysSuccess装饰器 - 总是返回成功
---@class AlwaysSuccessNode : DecoratorNode
local AlwaysSuccessNode = Class("AlwaysSuccessNode", DecoratorNode)

function AlwaysSuccessNode:decorate(child_status)
    -- 等待子节点完成，但总是返回成功
    if child_status == BT.Status.RUNNING then
        return BT.Status.RUNNING
    end
    return BT.Status.SUCCESS
end

-- AlwaysFailure装饰器 - 总是返回失败
---@class AlwaysFailureNode : DecoratorNode
local AlwaysFailureNode = Class("AlwaysFailureNode", DecoratorNode)

function AlwaysFailureNode:decorate(child_status)
    -- 等待子节点完成，但总是返回失败
    if child_status == BT.Status.RUNNING then
        return BT.Status.RUNNING
    end
    return BT.Status.FAILURE
end

-- UntilSuccess装饰器 - 直到成功为止
---@class UntilSuccessNode : DecoratorNode
local UntilSuccessNode = Class("UntilSuccessNode", DecoratorNode)

function UntilSuccessNode:decorate(child_status)
    if child_status == BT.Status.SUCCESS then
        return BT.Status.SUCCESS
    elseif child_status == BT.Status.FAILURE then
        -- 重置子节点继续尝试
        if #self.children > 0 then
            self.children[1]:reset()
        end
        return BT.Status.RUNNING
    end
    return child_status -- RUNNING
end

-- UntilFailure装饰器 - 直到失败为止
---@class UntilFailureNode : DecoratorNode
local UntilFailureNode = Class("UntilFailureNode", DecoratorNode)

function UntilFailureNode:decorate(child_status)
    if child_status == BT.Status.FAILURE then
        return BT.Status.SUCCESS -- 子节点失败时，我们认为是成功的
    elseif child_status == BT.Status.SUCCESS then
        -- 重置子节点继续尝试
        if #self.children > 0 then
            self.children[1]:reset()
        end
        return BT.Status.RUNNING
    end
    return child_status -- RUNNING
end

---@class ActionNodeConfig : BaseNodeConfig
---@field type "ACTION"
---@field func fun(blackboard: Blackboard): BT.Status 行为函数

-- Action节点 - 行为节点
---@class ActionNode : BaseNode
---@field action_func function 行为函数
local ActionNode = Class("ActionNode", BaseNode)

function ActionNode:init(name, action_func)
    BaseNode.init(self, name)
    self.action_func = action_func
end

function ActionNode:execute()
    if self.action_func then
        return self.action_func(self.blackboard) or BT.Status.FAILURE
    end
    return BT.Status.FAILURE
end

---@class ConditionNodeConfig : BaseNodeConfig
---@field type "CONDITION"
---@field func fun(blackboard: Blackboard): boolean 行为函数

-- Condition节点 - 条件节点
---@class ConditionNode : BaseNode
---@field condition_func function 条件函数
local ConditionNode = Class("ConditionNode", BaseNode)

function ConditionNode:init(name, condition_func)
    BaseNode.init(self, name)
    self.condition_func = condition_func
end

function ConditionNode:execute()
    if self.condition_func then
        local result = self.condition_func(self.blackboard)
        return result and BT.Status.SUCCESS or BT.Status.FAILURE
    end
    return BT.Status.FAILURE
end

-- 导出所有节点类
BT.BaseNode = BaseNode
BT.SequenceNode = SequenceNode
BT.FallbackNode = FallbackNode
BT.ParallelNode = ParallelNode
BT.DecoratorNode = DecoratorNode
BT.InverterNode = InverterNode
BT.RepeaterNode = RepeaterNode
BT.TimeoutNode = TimeoutNode
BT.RetryNode = RetryNode
BT.CooldownNode = CooldownNode
BT.AlwaysSuccessNode = AlwaysSuccessNode
BT.AlwaysFailureNode = AlwaysFailureNode
BT.UntilSuccessNode = UntilSuccessNode
BT.UntilFailureNode = UntilFailureNode
BT.ActionNode = ActionNode
BT.ConditionNode = ConditionNode

return BT
