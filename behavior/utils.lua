-- 行为树工具和常量
BT = BT or {}

-- 节点状态枚举
---@enum BT.Status
BT.Status = {
    SUCCESS = "SUCCESS",
    FAILURE = "FAILURE",
    RUNNING = "RUNNING"
}

-- 消息类型枚举
---@enum BT.MessageType
BT.MessageType = {
    BLACKBOARD = "BLACKBOARD"
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
    WAIT = "WAIT",
    ONCE = "ONCE",
    SUBTREE_REF = "SUBTREE_REF",
    -- 执行节点
    ACTION = "ACTION",
    CONDITION = "CONDITION",
}

-- 并行节点策略
---@enum BT.ParallelPolicy
BT.ParallelPolicy = {
    REQUIRE_ONE = "REQUIRE_ONE", -- 需要一个成功
    REQUIRE_ALL = "REQUIRE_ALL"  -- 需要全部成功
}

-- 工具函数
BT.Utils = {}

BT.Conditions = {} ---@type table<string, fun(blackboard: Blackboard, args: table?) : boolean>
BT.Actions = {} ---@type table<string, fun(blackboard: Blackboard, args: table?) : BT.Status>

-- 解析黑板引用数据
---@param data any 输入数据
---@param blackboard Blackboard? 黑板实例
---@return any 解析后的值
function BT.Utils.resolve_blackboard_data(data, blackboard)
    -- 检查是否是黑板引用格式: {BT.MessageType.BLACKBOARD, keyname[, defaultValue]}
    if type(data) == "table" and #data >= 2 and data[1] == BT.MessageType.BLACKBOARD then
        if blackboard then
            local keyname = data[2]
            local default_value = data[3]
            return blackboard:get(keyname, default_value)
        else
            -- 如果没有黑板实例，返回默认值或nil
            return data[3]
        end
    end

    -- 如果不是黑板引用格式，直接返回原数据
    return data
end

-- 为节点添加属性值解析功能
---@param node BaseNode 节点实例
---@param property_name string 属性名称
---@param value any 属性值（可能包含黑板引用）
function BT.Utils.set_node_property(node, property_name, value)
    -- name属性不使用黑板引用逻辑
    if property_name == "name" then
        node[property_name] = value
        return
    end

    -- 其他属性支持黑板引用
    node[property_name] = value
end

-- 为节点添加获取属性值的功能
---@param node BaseNode 节点实例
---@param property_name string 属性名称
---@return any 解析后的属性值
function BT.Utils.get_node_property(node, property_name)
    -- name属性不使用黑板引用逻辑
    if property_name == "name" then
        return node[property_name]
    end

    -- 其他属性支持黑板引用解析
    local raw_value = node[property_name]
    return BT.Utils.resolve_blackboard_data(raw_value, node.blackboard)
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
