const jwt = require('jsonwebtoken');

const token = jwt.sign({ id: 1, name: 'Test' }, 'CMDS_SECRET_KEY', { expiresIn: '1h' });

async function run() {
    try {
        const res = await fetch('http://localhost:3001/api/dashboard/stats?startYear=2020&sector=salud', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        console.log("Stats (Salud):", JSON.stringify(data, null, 2));
    } catch(e) {
        console.error(e.message);
    }
}
run();
