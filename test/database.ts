import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { Database, Statement } from '../src/lib/platform.ts';
export function database():Database & {close():void} {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON;');
  const migrations=new URL('../migrations/',import.meta.url);
  for(const file of readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(file,migrations),'utf8'));
  const prepare=(sql:string):Statement=>{let values:unknown[]=[];return {bind(...args:unknown[]){values=args;return this;},async first<T>(){return (sqlite.prepare(sql).get(...values as never[])??null) as T|null;},async all<T>(){return {results:sqlite.prepare(sql).all(...values as never[]) as T[]};},async run(){const statement=sqlite.prepare(sql);if(statement.columns().length) return {results:statement.all(...values as never[]),meta:{changes:0}};const result=statement.run(...values as never[]);return {results:[],meta:{changes:Number(result.changes)}};}};};
  return {prepare,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close(){sqlite.close();}};
}
