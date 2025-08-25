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
---@field is_running boolean 是否运行
---@field completed_success_count integer 已完成的成功节点数
---@field completed_failure_count integer 已完成的失败节点数
local ParallelNode = Class("ParallelNode", BaseNode)

function ParallelNode:init(name, policy)
    BaseNode.init(self, name)
    self.current_children = {}
    self.is_running = false
    self.completed_success_count = 0 -- 已完成的成功节点数
    self.completed_failure_count = 0 -- 已完成的失败节点数
    BT.Utils.set_node_property(self, "policy", policy or BT.ParallelPolicy.REQUIRE_ALL)
end

function ParallelNode:execute()
    local current_success_count = 0
    local current_failure_count = 0
    local running_count = 0
    local temp_children = {}

    if not self.is_running then
        -- 第一次执行，执行所有子节点
        self.completed_success_count = 0
        self.completed_failure_count = 0

        for _, child in ipairs(self.children) do
            local status = child:execute()

            if status == BT.Status.SUCCESS then
                current_success_count = current_success_count + 1
                self.completed_success_count = self.completed_success_count + 1
            elseif status == BT.Status.FAILURE then
                current_failure_count = current_failure_count + 1
                self.completed_failure_count = self.completed_failure_count + 1
            else -- RUNNING
                running_count = running_count + 1
                table.insert(temp_children, child)
            end
        end
    else
        -- 后续执行，只执行之前Running的节点
        current_success_count = self.completed_success_count
        current_failure_count = self.completed_failure_count

        for _, child in ipairs(self.current_children) do
            local status = child:execute()

            if status == BT.Status.SUCCESS then
                current_success_count = current_success_count + 1
                self.completed_success_count = self.completed_success_count + 1
            elseif status == BT.Status.FAILURE then
                current_failure_count = current_failure_count + 1
                self.completed_failure_count = self.completed_failure_count + 1
            else -- RUNNING
                running_count = running_count + 1
                table.insert(temp_children, child)
            end
        end
    end

    -- 如果还有Running节点，继续运行
    if running_count > 0 then
        self.current_children = temp_children
        self.is_running = true
        return BT.Status.RUNNING
    end

    -- 所有节点都执行完毕，根据策略判断结果
    self.is_running = false
    local policy = BT.Utils.get_node_property(self, "policy")
    if policy == BT.ParallelPolicy.REQUIRE_ONE then
        if current_success_count > 0 then
            return BT.Status.SUCCESS
        else
            return BT.Status.FAILURE
        end
    else -- REQUIRE_ALL
        if current_failure_count > 0 then
            return BT.Status.FAILURE
        elseif current_success_count == #self.children then
            return BT.Status.SUCCESS
        else
            return BT.Status.FAILURE
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

function RepeaterNode:reset()
    DecoratorNode.reset(self)
    self.current_count = 0
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

-- SubtreeRef装饰器 - 引用子树
---@class SubtreeRefNode : DecoratorNode
---@field subtree_name string 子树名称
---@field subtree_root BaseNode? 子树的根节点
local SubtreeRefNode = Class("SubtreeRefNode", DecoratorNode)

function SubtreeRefNode:init(name, subtree_name)
    DecoratorNode.init(self, name)
    BT.Utils.set_node_property(self, "subtree_name", subtree_name or "")
    self.subtree_root = nil
end

function SubtreeRefNode:set_subtree_root(root_node)
    self.subtree_root = root_node
    if self.subtree_root then
        self.subtree_root:set_blackboard(self.blackboard)
    end
end

function SubtreeRefNode:set_blackboard(blackboard)
    DecoratorNode.set_blackboard(self, blackboard)
    if self.subtree_root then
        self.subtree_root:set_blackboard(blackboard)
    end
end

function SubtreeRefNode:execute()
    -- 如果有子树，执行子树而不是子节点
    if self.subtree_root then
        return self.subtree_root:execute()
    end

    -- 如果没有子树，降级为普通装饰器执行子节点
    if #self.children > 0 then
        return self.children[1]:execute()
    end

    return BT.Status.FAILURE
end

function SubtreeRefNode:reset()
    DecoratorNode.reset(self)
    if self.subtree_root then
        self.subtree_root:reset()
    end
end

function SubtreeRefNode:get_subtree_name()
    return BT.Utils.get_node_property(self, "subtree_name")
end

---@class ActionNodeConfig : BaseNodeConfig
---@field type "ACTION"
---@field func fun(blackboard: Blackboard, args: table?): BT.Status 行为函数
---@field params table? 参数表

-- Action节点 - 行为节点
---@class ActionNode : BaseNode
---@field action_func function 行为函数
---@field params table? 参数表
local ActionNode = Class("ActionNode", BaseNode)

function ActionNode:init(name, action_func, params)
    BaseNode.init(self, name)
    self.action_func = action_func
    self.params = params
end

function ActionNode:execute()
    if self.action_func then
        return self.action_func(self.blackboard, self.params) or BT.Status.FAILURE
    end
    return BT.Status.FAILURE
end

---@class ConditionNodeConfig : BaseNodeConfig
---@field type "CONDITION"
---@field func fun(blackboard: Blackboard, args: table?): boolean 行为函数
---@field params table? 参数表

-- Condition节点 - 条件节点
---@class ConditionNode : BaseNode
---@field condition_func function 条件函数
---@field params table? 参数表
local ConditionNode = Class("ConditionNode", BaseNode)

function ConditionNode:init(name, condition_func, params)
    BaseNode.init(self, name)
    self.condition_func = condition_func
    self.params = params
end

function ConditionNode:execute()
    if self.condition_func then
        local result = self.condition_func(self.blackboard, self.params)
        return result and BT.Status.SUCCESS or BT.Status.FAILURE
    end
    return BT.Status.FAILURE
end

-- Wait装饰器 - 等待指定时间后执行子节点
---@class WaitNode : DecoratorNode
---@field wait_duration number 等待时间（秒）
---@field wait_start_time number? 开始等待时间
---@field is_waiting boolean 是否在等待中
local WaitNode = Class("WaitNode", DecoratorNode)

function WaitNode:init(name, wait_duration)
    DecoratorNode.init(self, name)
    BT.Utils.set_node_property(self, "wait_duration", wait_duration or 1.0)
    self.wait_start_time = nil
    self.is_waiting = false
end

function WaitNode:execute()
    if #self.children == 0 then
        return BT.Status.FAILURE
    end

    -- 如果还没开始等待，开始计时
    if not self.is_waiting then
        self.wait_start_time = BT.Frameout.frame
        self.is_waiting = true
        return BT.Status.RUNNING
    end

    -- 检查等待时间是否已过
    local current_time = BT.Frameout.frame
    local wait_duration = BT.Utils.get_node_property(self, "wait_duration")
    local elapsed_time = (current_time - self.wait_start_time) / 30 -- 转换为秒

    if elapsed_time < wait_duration then
        return BT.Status.RUNNING
    end

    -- 等待结束，执行子节点
    if self.children[1] then
        local child_status = self.children[1]:execute()

        -- 如果子节点完成（成功或失败），重置等待状态
        if child_status ~= BT.Status.RUNNING then
            self.is_waiting = false
            self.wait_start_time = nil
        end

        return child_status
    else
        return BT.Status.SUCCESS
    end
end

function WaitNode:reset()
    DecoratorNode.reset(self)
    self.is_waiting = false
    self.wait_start_time = nil
end

-- Once装饰器 - 一次性节点，只在第一次遍历时执行
---@class OnceNode : DecoratorNode
---@field has_executed boolean 是否已经执行过
---@field final_result BT.Status? 最终结果状态
local OnceNode = Class("OnceNode", DecoratorNode)

function OnceNode:init(name)
    DecoratorNode.init(self, name)
    self.has_executed = false
    self.final_result = nil
end

function OnceNode:execute()
    if #self.children == 0 then
        return BT.Status.FAILURE
    end

    -- 如果已经执行过，直接返回之前的结果
    if self.has_executed then
        return self.final_result or BT.Status.FAILURE
    end

    -- 第一次执行子节点
    local child_status = self.children[1]:execute()

    -- 如果子节点完成（成功或失败），标记为已执行并保存结果
    if child_status ~= BT.Status.RUNNING then
        self.has_executed = true
        self.final_result = child_status
    end

    return child_status
end

function OnceNode:reset()
    -- 注意：OnceNode的reset不会重置has_executed状态
    -- 这样保证了它的"一次性"特性，除非显式调用force_reset()
    DecoratorNode.reset(self)
end

-- 强制重置一次性节点，允许再次执行
function OnceNode:force_reset()
    self.has_executed = false
    self.final_result = nil
    DecoratorNode.reset(self)
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
BT.SubtreeRefNode = SubtreeRefNode
BT.ActionNode = ActionNode
BT.ConditionNode = ConditionNode
BT.WaitNode = WaitNode
BT.OnceNode = OnceNode

return BT
