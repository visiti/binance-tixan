
const axios = require('axios');
const hmacSHA256 = require('crypto-js/hmac-sha256');
const exec = require('child_process').execSync;

const SECRETKEY = process.env.SECRETKEY;
const APIKEY = process.env.APIKEY;
const HOST = process.env.HOST;


axios.defaults.headers['X-MBX-APIKEY'] = APIKEY;

axios.interceptors.request.use((config) => {
    let timestamp = Date.now() + '';
    let params = new URLSearchParams();
    for (let key in config.params) {
        if (config.ban && config.ban.includes[key]) { continue }
        params.append(key, config.params[key]);
    }
    params.append('timestamp', timestamp);
    var signature = hmacSHA256(params.toString(), SECRETKEY).toString();
    params.append("signature", signature);
    config.params = Object.assign(config.params || {}, { timestamp, signature })
    return config;
})

function getTotal(payload, asset) {
    return axios
        .get(`https://www.${HOST}/dapi/v1/income`, {
            params: payload
        })
        .then(({ data }) => {
            return data.reduce((t, d) => {
                if ((d.incomeType === "REALIZED_PNL" || d.incomeType === 'COMMISSION') && d.income > 0 && d.asset == asset) {
                    t += Number(d.income);
                }
                return t / 10
            }, 0)
        });
}

function balance(asset) {
    return axios.get('https://www.${HOST}/dapi/v1/balance').then(({ data }) => {
        for (const item of data) {
            if (item.availableBalance === asset) {
                return item.availableBalance;
            }
        }
        return 0;
    })
}

function transferHistory(asset) {
    return axios.get(`https://api.${HOST}/sapi/v1/asset/transfer`, {
        params: {
            type: 'CMFUTURE_MAIN',
        }
    }).then(({ data }) => {
        let lastTime = Date.now() - 1000 * 60 * 60 * 24;
        for (let row of data.rows) {
            if (row.asset === asset && row.status === 'CONFIRMED') {
                lastTime = row.timestamp + 1;
                break;
            }
        }
        return lastTime;
    })
}

function transfer(amount = 0) {
    return axios.post(`https://api.${HOST}/sapi/v1/asset/transfer`, null, {
        params: {
            type: 'CMFUTURE_MAIN',
            asset: 'ETH',
            amount
        }
    })
}

async function tixian(asset = 'ETH') {
    try {
        // 获取上次提现时间
        let lastTime = await transferHistory(asset);
        // 获取本次需要提现数
        let total = await getTotal({
            startTime: lastTime,
            symbol: asset + 'USD_PERP'
        }, asset)
        // 判断提现数是否小于等于零 && 提现金额是否小于可提现额 是的话 不进行提现
        if (total <= 0) { return }
        let availableBalance = await balance(asset);
        if (total < availableBalance) {
            return
        }
        transfer(total)
    } catch (error) {
        console.log(error)
    }

}

tixian();
