const Fastify = require('fastify');
const { Client } = require('@line/bot-sdk');

const fastify = Fastify({
    logger: true
});

const config = {
    channelAccessToken: 'ssy4qkF/juUntfwLX2hfMnmiPRTieg15QAN916kZI2ei1IvHFdXXxJ1x2GFMDlPqzgWz3eb6Xam4LaIHNtitGZXTg00iIoWsWqTKQR6daCR4YovtSaYryphnKWKIBGgLvFGBgUjcnHXgeSv/i3mRGKwdB04t89/1O/w1cDnyilFU=', // ใส่ Channel Access Token ของคุณ
    channelSecret: 'd448d972bb7af64fb49278bf5ecf5099d', // ใส่ Channel Secret ของคุณ
};

const client = new Client(config);

// เก็บ userId หรือ groupId เมื่อมีคนส่งข้อความเข้ามา
let savedId = 'C7ddf341b4000c64596febf59fba4c6b43';

// ตั้งค่า route สำหรับ webhook
fastify.post('/webhook', async (request, reply) => {
    const events = request.body.events;

    events.forEach((event) => {
        if (event.type === 'message' && event.message.type === 'text') {
            handleTextMessage(event);
        }
    });

    reply.send({ success: true });
});

async function handleTextMessage(event) {
    // if (event.source.type === 'user') {
    //     savedId = event.source.userId; // เก็บ userId
    // } else if (event.source.type === 'group') {
    //     savedId = event.source.groupId; // เก็บ groupId
    // } else if (event.source.type === 'room') {
    //     savedId = event.source.roomId; // เก็บ roomId
    // }

    const message = {
        type: 'text',
        text: `คุณส่งข้อความว่า: ${event.source.groupId}`
    };

    try {
        await client.replyMessage(event.replyToken, message);
        fastify.log.info('Message replied');
    } catch (err) {
        fastify.log.error(err);
    }
}

// ตั้งค่า route สำหรับรับข้อมูลจาก Jenkins Pipeline
fastify.post('/push', async (request, reply) => {
    // รับข้อมูล JSON จาก Jenkins
    const data = request.body;
    const buildInfos = data['Build Info'] || {};
    const jobNames = buildInfos.jobName || 'Unknown Job';
    const buildNumbers = buildInfos.buildNumber || 'N/A';
    const statuss = buildInfos.status || 'Unknown Status';
    const users = buildInfos.user || 'Unknown User';


    // ตรวจสอบว่ามี savedId หรือไม่
    if (!savedId) {
        return reply.send({ error: 'ไม่มี ID ที่บันทึกไว้สำหรับส่ง push message' });
    }

    // สร้าง Flex Message จากข้อมูลที่ได้รับ
    const flexMessage = generateFlexMessageFromData(data);

    const pushMessage = {
        type: 'flex',
        // altText: 'Jenkins Build Notification',
        altText: statuss + ' ' +jobNames || 'Jenkins Build Notification', // ตั้งค่า altText เป็น status
        contents: flexMessage
    };

    try {
        await client.pushMessage(savedId, pushMessage);
        fastify.log.info('Push message sent');
        reply.send({ success: true });
    } catch (err) {
        fastify.log.error(err);
        reply.send({ error: err.message });
    }
});

// ฟังก์ชันสำหรับสร้าง Flex Message จากข้อมูลที่ได้รับ
function generateFlexMessageFromData(data) {
    const buildInfo = data['Build Info'] || {};
    const jobName = buildInfo.jobName || 'Unknown Job';
    const buildNumber = buildInfo.buildNumber || 'N/A';
    const status = buildInfo.status || 'Unknown Status';
    const user = buildInfo.user || 'Unknown User';

    // กำหนดสีพื้นหลังตามสถานะ
    const bgColor = status === 'SUCCESS' ? '#0367D3' : '#FF0000';

    // สร้าง Flex Message ตามเทมเพลตที่กำหนด
    const flexMessage = {
        "type": "bubble",
        "size": "mega",
        "header": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                // ชื่อระบบ
                {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        // {
                        //     "type": "text",
                        //     "text": "ชื่อระบบ",
                        //     "color": "#ffffff66",
                        //     "size": "sm"
                        // },
                        {
                            "type": "text",
                            "text": jobName,
                            "color": "#ffffff",
                            "size": "md",
                            "flex": 4,
                            "weight": "bold"
                        }
                    ]
                },
                // สถานะ
                {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        // {
                        //     "type": "text",
                        //     "text": "สถานะ",
                        //     "color": "#ffffff66",
                        //     "size": "sm"
                        // },
                        {
                            "type": "text",
                            "text": status,
                            "color": "#ffffff",
                            "size": "md",
                            "flex": 4,
                            "weight": "bold"
                        }
                    ]
                }
            ],
            "paddingAll": "10px",
            "backgroundColor": bgColor,
            "spacing": "md",
            "height": "75px",
            "paddingTop": "20px"
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                // ผู้ใช้งาน
                {
                    "type": "text",
                    "text": `👤 ผู้ใช้งาน: ${user}`,
                    "color": "#e30202",
                    "size": "xl"
                },
                // หมายเลข Build
                {
                    "type": "text",
                    "text": `🔢 Build Number: ${buildNumber}`,
                    "size": "sm",
                    "margin": "md"
                },
                // รายละเอียดขั้นตอนต่าง ๆ
                ...generateStageContents(data)
            ]
        }
    };

    return flexMessage;
}

// ฟังก์ชันสำหรับสร้างเนื้อหาของแต่ละขั้นตอน
function generateStageContents(data) {
    const contents = [];

    // แยกข้อมูล Build Info ออก
    const buildInfo = data['Build Info'];
    delete data['Build Info'];

    // วนลูปผ่านแต่ละขั้นตอน
    for (let stage in data) {
        const stageData = data[stage];
        const stageStatus = stageData.status || 'Unknown';
        const stageError = stageData.error || '';

        contents.push(
            {
                "type": "separator",
                "margin": "xs"
            },
            {
                "type": "box",
                "layout": "vertical",
                "margin": "md",
                "contents": [
                    {
                        "type": "text",
                        "text": `🚀 ขั้นตอน: ${stage}`,
                        "size": "xxs",
                        "weight": "bold"
                    },
                    {
                        "type": "text",
                        "text": `สถานะ: ${stageStatus}`,
                        "size": "xxs",
                        "color": stageStatus === 'success' ? "#008000" : "#FF0000"
                    },
                    ...(stageError ? [{
                        "type": "text",
                        "text": `ข้อผิดพลาด: ${stageError}`,
                        "size": "xs",
                        "color": "#FF0000",
                        "wrap": true
                    }] : [])
                ]
            }
        );
    }

    return contents;
}

const start = async () => {
    try {
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
        fastify.log.info(`Server listening on http://localhost:3000`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();