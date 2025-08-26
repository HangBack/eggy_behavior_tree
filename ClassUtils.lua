---@class Class
---@field __name string 类名
---@field __index table 类的元表
---@field new fun(self: Class, ...): any 创建类的实例
---@field init fun(self: table, ...) 类的构造函数
function Class(class_name, ...)
    local parents = { ... }
    local class_table = {
        __name = class_name,
        __parents = parents,
    }

    -- 设置类表的元表，用于处理类方法的继承
    if #parents > 0 then
        setmetatable(class_table, {
            __index = function(t, key)
                -- 遍历所有父类查找方法
                for _, parent in ipairs(parents) do
                    local value = parent[key]
                    if value ~= nil then
                        return value
                    end
                end
            end
        })
    end

    -- 类的new方法，用于创建实例
    function class_table:new(...)
        local instance = {}

        -- 递归查找继承链中的__custom_index
        local function find_custom_index(current_class)
            local custom_index = rawget(current_class, "__custom_index")
            if custom_index then
                return custom_index
            end
            for _, parent_table in ipairs(current_class.__parents) do
                custom_index = find_custom_index(parent_table)
                if custom_index then
                    return custom_index
                end
            end
            return nil
        end

        -- 递归查找getter方法
        local function find_getter(current_class, key)
            local getter_name = "__get_" .. key
            local getter = rawget(current_class, getter_name)
            if getter then
                return getter
            end
            for _, parent_table in ipairs(current_class.__parents) do
                getter = find_getter(parent_table, key)
                if getter then
                    return getter
                end
            end
            return nil
        end

        -- 递归查找setter方法
        local function find_setter(current_class, key)
            local setter_name = "__set_" .. key
            local setter = rawget(current_class, setter_name)
            if setter then
                return setter
            end
            for _, parent_table in ipairs(current_class.__parents) do
                setter = find_setter(parent_table, key)
                if setter then
                    return setter
                end
            end
            return nil
        end

        -- 创建实例的元表
        local instance_meta = {
            __index = function(t, key)
                -- 1. 先检查是否有getter方法
                local getter = find_getter(class_table, key)
                if getter then
                    return getter(t)
                end

                -- 2. 然后尝试自定义索引方法（递归查找继承链）
                local custom_index = find_custom_index(class_table)
                if custom_index then
                    local result = custom_index(t, key)
                    if result ~= nil then
                        return result
                    end
                end

                -- 3. 最后尝试在类继承链中查找
                local value = class_table[key]
                if value ~= nil then
                    return value
                end
            end,

            __newindex = function(t, key, value)
                -- 检查是否有setter方法
                local setter = find_setter(class_table, key)
                if setter then
                    setter(t, value)
                else
                    -- 没有setter时直接设置值
                    rawset(t, key, value)
                end
            end
        }

        setmetatable(instance, instance_meta)

        -- 调用初始化方法
        if self.init then
            self.init(instance, ...)
        end

        return instance
    end

    return class_table
end
