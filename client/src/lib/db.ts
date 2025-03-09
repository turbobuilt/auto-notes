import { Dexie } from "dexie";

export const db = new Dexie('TherapyNotesDB') as any;
db.version(1).stores({
  sessions: '++id,date,duration,status,clientName',
  recordings: 'sessionId,blob,arrayBuffer',  // Added arrayBuffer field for compatibility
  transcripts: 'sessionId,text',
  summaries: 'sessionId,text'
});