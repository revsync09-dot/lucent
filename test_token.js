require('dotenv').config();

async function testUserFetch() {
    const token = process.env.DISCORD_TOKEN;
    const userId = '857581573670699050';
    
    try {
        const res = await fetch(`https://discord.com/api/v10/users/${userId}`, {
            headers: { 
                Authorization: `Bot ${token}`,
                'User-Agent': 'HyperionsStatusBot (v1.0)'
            }
        });
        const data = await res.json();
        console.log('Status:', res.status);
        console.log('Data:', data);
    } catch (err) {
        console.error('Error:', err.message);
    }
}

testUserFetch();
