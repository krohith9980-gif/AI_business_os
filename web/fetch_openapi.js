const fs = require('fs');
async function run() {
  const url = 'https://lhtibverxjpcvmajzazv.supabase.co/rest/v1/?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxodGlidmVyeGpwY3ZtYWp6YXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjgxMTgsImV4cCI6MjEwMjMwNDExOH0.N_DwZogAi_wqfmZdjlFBeeV59fMkv46n2PoqJNoHOvM';
  const res = await fetch(url);
  const data = await res.json();
  fs.writeFileSync('openapi.json', JSON.stringify(data, null, 2));
  console.log('Saved to openapi.json. Tables:', Object.keys(data.definitions).length);
}
run();
