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
        setmetatable(instance, self)

        -- 实例的元表索引处理
        self.__index = function(t, key)
            -- 1. 尝试在类继承链中查找
            local value = class_table[key]
            if value ~= nil then
                return value
            end

            -- 2. 尝试自定义索引方法
            local custom_index = rawget(class_table, "__custom_index")
            if custom_index then
                return custom_index(t, key)
            end
            for _, parent_table in ipairs(class_table.__parents) do
                custom_index = rawget(parent_table, "__custom_index")
                if custom_index then
                    return custom_index(t, key)
                end
            end
        end

        -- 调用初始化方法
        if self.init then
            self.init(instance, ...)
        end

        return instance
    end

    return class_table
end
