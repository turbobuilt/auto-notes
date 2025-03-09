import { db } from "lib/db";

export const migrations = [
    makeTable('Entity'),
]


export function tbl(table) {
    return table.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function makeTable(name) {
    // id string primary key, data jsonb
    return `CREATE TABLE "${tbl(name)}" (id VARCHAR PRIMARY KEY, kind varchar, data JSONB)`
}
// Create migrations table if it doesn't exist and run pending migrations
export async function runMigrations(client: typeof db) {
    // Create migrations table if it doesn't exist
    await client.queryParameters(`
        CREATE TABLE IF NOT EXISTS migrations (
            id SERIAL PRIMARY KEY,
            index INTEGER NOT NULL UNIQUE,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Get the highest migration index that has been executed
    const result = await client.queryParameters(`
        SELECT MAX(index) as max_index FROM migrations
    `);
    const lastExecutedIndex = result[0].max_index ?? -1;

    console.log(`Last executed migration index: ${lastExecutedIndex}`);
    
    // Execute migrations that haven't been run yet
    for (let i = lastExecutedIndex + 1; i < migrations.length; i++) {
        console.log(`Executing migration ${i}...`);
        try {
            // Begin transaction
            await client.queryParameters('BEGIN');
            
            // Execute migration
            await client.queryParameters(migrations[i]);
            
            // Record successful migration
            await client.queryParameters(`
                INSERT INTO migrations (index) VALUES ($1)
            `, [i]);
            
            // Commit transaction
            await client.queryParameters('COMMIT');
            
            console.log(`Migration ${i} executed successfully`);
        } catch (error) {
            // Rollback transaction in case of error
            await client.queryParameters('ROLLBACK');
            console.error(`Failed to execute migration ${i}:`, error);
            throw error;
        }
    }
}
