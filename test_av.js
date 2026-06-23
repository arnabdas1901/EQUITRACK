require('dotenv').config();
const delay = ms => new Promise(res => setTimeout(res, ms));

async function testAlphaVantage(func) {
    const url = `https://www.alphavantage.co/query?function=${func}&interval=monthly&apikey=${process.env.ALPHAVANTAGE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    console.log(`AlphaVantage ${func} (monthly):`, data.data ? `Success: ${data.data.length} records, latest: ${data.data[0].value}` : JSON.stringify(data));
}

async function run() {
    await testAlphaVantage('COPPER');
    await delay(1500);
    await testAlphaVantage('ALUMINUM');
    await delay(1500);
    await testAlphaVantage('WHEAT');
}
run();
