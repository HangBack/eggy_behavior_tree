-- 行为树工具和常量
BT = BT or {}

-- 节点状态枚举
---@enum BT.Status
BT.Status = {
    SUCCESS = "SUCCESS",
    FAILURE = "FAILURE",
    RUNNING = "RUNNING"
}

-- 节点类型枚举
---@enum BT.NodeType
BT.NodeType = {
    -- 控制节点
    SEQUENCE = "SEQUENCE",
    FALLBACK = "FALLBACK",
    PARALLEL = "PARALLEL",
    -- 装饰器节点
    DECORATOR = "DECORATOR",
    INVERTER = "INVERTER",
    REPEATER = "REPEATER",
    TIMEOUT = "TIMEOUT",
    FORCE_SUCCESS = "FORCE_SUCCESS",
    FORCE_FAILURE = "FORCE_FAILURE",
    RETRY = "RETRY",
    COOLDOWN = "COOLDOWN",
    ALWAYS_SUCCESS = "ALWAYS_SUCCESS",
    ALWAYS_FAILURE = "ALWAYS_FAILURE",
    UNTIL_SUCCESS = "UNTIL_SUCCESS",
    UNTIL_FAILURE = "UNTIL_FAILURE",
    -- 执行节点
    ACTION = "ACTION",
    CONDITION = "CONDITION"
}

-- 并行节点策略
---@enum BT.ParallelPolicy
BT.ParallelPolicy = {
    REQUIRE_ONE = "REQUIRE_ONE", -- 需要一个成功
    REQUIRE_ALL = "REQUIRE_ALL"  -- 需要全部成功
}

-- 工具函数
BT.Utils = {}

BT.Conditions = {} ---@type table<string, fun(blackboard: Blackboard) : boolean>
BT.Actions = {} ---@type table<string, fun(blackboard: Blackboard) : BT.Status>

-- 深拷贝函数
function BT.Utils.deep_copy(orig)
    local copy
    if type(orig) == 'table' then
        copy = {}
        for orig_key, orig_value in next, orig, nil do
            copy[BT.Utils.deep_copy(orig_key)] = BT.Utils.deep_copy(orig_value)
        end
        setmetatable(copy, BT.Utils.deep_copy(getmetatable(orig)))
    else
        copy = orig
    end
    return copy
end

-- 日志函数
function BT.Utils.log(message)
    print("[BehaviorTree] " .. tostring(message))
end

return BT
