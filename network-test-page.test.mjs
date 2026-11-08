import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('mobile diagnostics page is self-contained, readable and exposes a copyable privacy-safe report',()=>{
 const html=readFileSync('network-test.html','utf8');
 assert.match(html,/lang="zh-CN"/);
 assert.match(html,/viewport/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/id="runTest"/);
 assert.match(html,/id="copyReport"/);
 assert.match(html,/id="connectionType"/);
 assert.match(html,/network-lab\.mjs/);
 assert.match(html,/supabase-network-check\.mjs/);
 assert.match(html,/roles?|Supabase HTTPS/i);
 assert.doesNotMatch(html,/service_role|[A-Z0-9_]{20,}\.supabase\.co/);
});
test('friends hub links to mobile diagnostic without changing its default Supabase provider',()=>{
 const hub=readFileSync('friends-hub.js','utf8');
 assert.match(hub,/href="\.\/network-test\.html"/);
 assert.match(hub,/<option value="sb" selected>/);
 assert.match(hub,/<option value="cf">/);
});
