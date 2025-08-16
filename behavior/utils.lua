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

---@class Frameout
---@field frame integer 当前帧数
---@field left_count integer 剩余次数
---@field destroy fun() 销毁计时器
---@field pause fun() 暂停计时器
---@field resume fun() 恢复计时器

---@param interval integer 计时间隔（单位：帧）
---@param callback fun(frameout: Frameout) 回调函数
---@param count integer? 重复次数，-1为无限次
---@param immediately boolean? 是否立即执行回调
SetFrameOut = function(interval, callback, count, immediately)
    count = count or -1
    local frameout = {
        frame = 0,
        left_count = count,
        status = true
    }
    local decorator = function()
        frameout.frame = frameout.frame + interval
        if count > 0 then
            frameout.left_count = frameout.left_count - 1
        end
        callback(frameout)
        if frameout and count > 0 and (frameout.left_count == 0) then
            frameout.destroy()
        end
    end
    local handler = LuaAPI.global_register_trigger_event(
        { EVENT.REPEAT_TIMEOUT, math.tofixed(interval) / 30.0 }, decorator
    )
    ---销毁计时器
    frameout.destroy = function()
        LuaAPI.global_unregister_trigger_event(handler)
        frameout = nil
    end
    ---暂停计时器
    frameout.pause = function()
        LuaAPI.global_unregister_trigger_event(handler)
        frameout.status = false
    end
    ---恢复计时器
    frameout.resume = function()
        handler = LuaAPI.global_register_trigger_event(
            { EVENT.REPEAT_TIMEOUT, math.tofixed(interval) / 30.0 }, decorator
        )
        frameout.status = true
    end
    if immediately then
        decorator()
    end
    return frameout
end

return BT
