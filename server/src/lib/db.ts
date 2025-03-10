import moment from "moment"
import { Pool, PoolClient } from 'pg'
import crypto from 'crypto'
import base58 from 'bs58'

interface Condition {
  field: string
  operator: '='|'>'|'<'|'>='|'<='|'>'|'<'|'!='|'like'|'contains'|'in'|'starts_with'|'ends_with'
  value: any
}

interface Conditions {
  [field: string]: any
  and?: (Condition[] | Conditions | Conditions[])
  or?: (Condition[] | Conditions | Conditions[])
}

// Single table name for all entities
const ENTITY_TABLE = 'entity';

export function sanitizeTable(table: string): string {
    // Double-quote the table name to prevent SQL injection and handle special characters
    return `"${table.replace(/"/g, '""')}"`
}

class Db {
    pool: Pool

    constructor() {
        this.pool = new Pool({
            host: process.env.db_host || 'localhost',
            port: parseInt(process.env.db_port || '5432'),
            user: process.env.db_user || 'postgres',
            password: process.env.db_password || 'postgres',
            database: process.env.db_name || 'autotherapynotes',
        })
    }

    async connect(): Promise<PoolClient> {
        return await this.pool.connect()
    }

    private getEntityKind(table: string | Function): string {
        if (typeof table === 'string') {
            return table;
        } else {
            // If a class is provided, get the table name from the class name
            return table.name;
        }
    }

    async find<T = any>(
        table: string | (new (...args: any[]) => T),
        conditions: Conditions
    ): Promise<T[]> {
        const kind = this.getEntityKind(table);
        
        let query = `SELECT id, kind, data FROM ${sanitizeTable(ENTITY_TABLE)} WHERE kind = ?`
        const params: any[] = [kind]
        
        if (conditions && Object.keys(conditions).length > 0) {
            const whereClause = this.buildWhereClause(conditions, params)
            query += ` AND ${whereClause}`
        }
        
        const result = await this.queryParameters(query, params)
        
        if (typeof table === 'string') {
            return result.map(row => this.extractData(row));
        } else {
            // If a class constructor was provided, instantiate objects of that class
            return result.map(row => {
                const data = this.extractData(row);
                const instance = new (table as new (...args: any[]) => T)();
                return Object.assign(instance, data);
            });
        }
    }

    private buildWhereClause(conditions: Conditions, params: any[]): string {
        // Handle simple object format { field1: value1, field2: value2 }
        if (!conditions.and && !conditions.or) {
            const clauses: string[] = []
            for (const field in conditions) {
                params.push(conditions[field])
                if (field === 'id') {
                    clauses.push(`id = ?`)
                } else {
                    clauses.push(`data->>'${field}' = ?`)
                }
            }
            return clauses.join(' AND ')
        }
        
        // Handle explicit AND conditions
        if (conditions.and) {
            const andConditions = Array.isArray(conditions.and) ? conditions.and : [conditions.and]
            const clauses: string[] = []
            
            for (const condition of andConditions) {
                if ('field' in condition) {
                    // Use the helper method for building condition clauses
                    clauses.push(this.buildConditionClause(condition as Condition, params))
                } else {
                    // Recursive call for nested conditions
                    clauses.push(this.buildWhereClause(condition as Conditions, params))
                }
            }
            return `(${clauses.join(' AND ')})`
        }
        
        // Handle explicit OR conditions
        if (conditions.or) {
            const orConditions = Array.isArray(conditions.or) ? conditions.or : [conditions.or]
            const clauses: string[] = []
            
            for (const condition of orConditions) {
                if ('field' in condition) {
                    // Use the same helper method for building condition clauses
                    clauses.push(this.buildConditionClause(condition as Condition, params))
                } else {
                    // Recursive call for nested conditions
                    clauses.push(this.buildWhereClause(condition as Conditions, params))
                }
            }
            return `(${clauses.join(' OR ')})`
        }
        
        return '1=1' // Fallback if no conditions matched
    }

    private buildConditionClause(condition: Condition, params: any[]): string {
        const { field, operator, value } = condition
        params.push(value)
        
        // Special handling for id field
        if (field === 'id') {
            switch(operator) {
                case '=':
                    return `id = ?`;
                case '>':
                    return `id > ?`;
                case '<':
                    return `id < ?`;
                case '>=':
                    return `id >= ?`;
                case '<=':
                    return `id <= ?`;
                case '!=':
                    return `id != ?`;
                case 'like':
                    return `id LIKE ?`;
                case 'contains':
                    params[params.length - 1] = `%${value}%`;
                    return `id LIKE ?`;
                case 'starts_with':
                    params[params.length - 1] = `${value}%`;
                    return `id LIKE ?`;
                case 'ends_with':
                    params[params.length - 1] = `%${value}`;
                    return `id LIKE ?`;
                case 'in':
                    if (Array.isArray(value)) {
                        const placeholders = value.map(() => '?').join(',');
                        params.pop();
                        params.push(...value);
                        return `id IN (${placeholders})`;
                    }
                    return `1=0`; // Impossible condition if value is not an array
                default:
                    return `id = ?`; // Default to equals
            }
        }
        
        // Original handling for data fields
        switch(operator) {
            case '=':
                return `data->>'${field}' = ?`;
            case '>':
                return `(data->>'${field}')::text > ?`;
            case '<':
                return `(data->>'${field}')::text < ?`;
            case '>=':
                return `(data->>'${field}')::text >= ?`;
            case '<=':
                return `(data->>'${field}')::text <= ?`;
            case '!=':
                return `data->>'${field}' != ?`;
            case 'like':
                return `data->>'${field}' LIKE ?`;
            case 'contains':
                params[params.length - 1] = `%${value}%`;
                return `data->>'${field}' LIKE ?`;
            case 'starts_with':
                params[params.length - 1] = `${value}%`;
                return `data->>'${field}' LIKE ?`;
            case 'ends_with':
                params[params.length - 1] = `%${value}`;
                return `data->>'${field}' LIKE ?`;
            case 'in':
                if (Array.isArray(value)) {
                    const placeholders = value.map(() => '?').join(',');
                    params.pop();
                    params.push(...value);
                    return `data->>'${field}' IN (${placeholders})`;
                }
                return `1=0`; // Impossible condition if value is not an array
            default:
                return `data->>'${field}' = ?`; // Default to equals
        }
    }

    async insert(item: any): Promise<any> {
        const kind = item.constructor.name;
        // Ensure created and updated timestamps
        if (!item.created) {
            item.created = Date.now()
        }
        item.updated = Date.now()
        
        // Generate ID if not provided
        if (!item.id) {
            item.id = await makeId()
        }
        
        // Extract all fields into data JSON except id
        const id = item.id
        const data = { ...item }
        delete data.id
        
        const query = `INSERT INTO ${sanitizeTable(ENTITY_TABLE)} (id, kind, data) VALUES (?, ?, ?)
                      RETURNING id, kind, data`
        const params = [id, kind, JSON.stringify(data)]
        
        const result = await this.queryParameters(query, params)
        return this.extractData(result[0])
    }

    async update(item: any): Promise<any> {
        let table = item.constructor.name;
        if (!item.id) {
            throw new Error('Item must have an id to update')
        }
        
        const kind = this.getEntityKind(table);
        
        // Update timestamp
        item.updated = Date.now()
        
        // Extract all fields into data JSON except id
        const id = item.id
        const data = { ...item }
        delete data.id
        
        const query = `UPDATE ${sanitizeTable(ENTITY_TABLE)} SET data = ? 
                      WHERE id = ? AND kind = ? RETURNING id, kind, data`
        const params = [JSON.stringify(data), id, kind]
        
        const result = await this.queryParameters(query, params)
        if (result.rowCount === 0) {
            throw new Error(`Item with id ${id} and kind ${kind} not found`)
        }
        
        return this.extractData(result[0])
    }

    async delete(table: string, id: string): Promise<boolean> {
        const kind = this.getEntityKind(table);
        
        const query = `DELETE FROM ${sanitizeTable(ENTITY_TABLE)} WHERE id = ? AND kind = ?`
        const result = await this.queryParameters(query, [id, kind])
        
        return result.rowCount > 0
    }

    async query(strings: TemplateStringsArray, ...values: any[]): Promise<any> {
        let query = strings[0]
        const parameters: any[] = []
        
        for (let i = 0; i < values.length; i++) {
            parameters.push(values[i])
            query += `?${strings[i + 1]}`
        }
        
        // Replace all ? with $1, $2, etc.
        let paramIndex = 0
        query = query.replace(/\?/g, () => `$${++paramIndex}`)
        
        console.log('Query:', query, 'Parameters:', parameters)
        let result = await this.pool.query(query, parameters);
        return result.rows;
    }

    async queryParameters(query: string, parameters: any[] = []): Promise<any> {
        // Replace ? with $1, $2, etc.
        let paramIndex = 0
        const formattedQuery = query.replace(/\?/g, () => `$${++paramIndex}`)
        console.log('Query:', formattedQuery, 'Parameters:', parameters)
        let result = await this.pool.query(formattedQuery, parameters)
        return result.rows;
    }

    extractData(data: any): any {
        if (!data) return null
        
        const result = { id: data.id, ...data.data }
        
        // Convert ISO string dates back to Date objects if needed
        if (typeof result.created === 'string') {
            result.created = new Date(result.created).getTime()
        }
        if (typeof result.updated === 'string') {
            result.updated = new Date(result.updated).getTime()
        }
        
        return result
    }
}

async function makeId(): Promise<string> {
    // Get nanoseconds as binary
    const now = process.hrtime.bigint()
    const timeBuffer = Buffer.from(now.toString(16).padStart(16, '0'), 'hex')
    
    // Add 4 random bytes
    const randomBuffer = crypto.randomBytes(4)
    
    // Combine and encode as base58
    const combinedBuffer = Buffer.concat([timeBuffer, randomBuffer])
    return base58.encode(combinedBuffer)
}

export const db = new Db();