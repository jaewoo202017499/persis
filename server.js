const express = require('express')
const app = express()

const { MongoClient, ObjectId } = require('mongodb')
require('dotenv').config()

const { createServer } = require('http')
const { Server } = require('socket.io')
const { object } = require('firebase-functions/v1/storage')
const server = createServer(app)
const io = new Server(server)

let db
const url = process.env.DB_URL
new MongoClient(url).connect().then((client) => {
    console.log('DB연결성공')
    server.listen(8080, () => {
        console.log('http://localhost:8080')
    })
    db = client.db('persischat') // 파일이름
}).catch((err) => {
    console.log(err)
})

// app.use(express.static(path.join(__dirname + '/public')))
app.use(express.static('public'))
app.set('view engine', 'ejs')
app.use(express.json())
app.use(express.urlencoded({ extended: true }))


app.get('/', (요청, 응답) => {
    응답.sendFile(__dirname + '/index.html')
})

app.post('/list', async (요청, 응답) => {

    let myRoom = await db.collection('chatroom').findOne({ creatUserID: 요청.body.id })
    if ((myRoom)) {
        console.log('존재함')
    } else {
        await db.collection('user').insertOne({
            id: 요청.body.id
        })

        await db.collection('chatroom').insertOne({
            creatUserID: 요청.body.id,
            userID: [요청.body.id],
            userNum: 1,
            date: new Date()
        })
        console.log('계정 새로 만들었음')
    }

    let chatroom = await db.collection('chatroom').find().toArray()
    응답.render('chatList.ejs', { userID: 요청.body.id, room: chatroom })
})

app.post('/room', async (요청, 응답) => {
    let currentRoom = await db.collection('chatroom')
        .findOne({ creatUserID: 요청.body.creatUserID })
    if (currentRoom.userID.includes(요청.body.userID)) {
    } else {
        let user = currentRoom.userID
        user.push(요청.body.userID)
        await db.collection('chatroom').updateOne(
            { _id: currentRoom._id },
            {
                $set: { userID: user },
                $inc: { userNum: 1 }
            }
        )
        currentRoom = await db.collection('chatroom')
            .findOne({ userID: 요청.body.userID })
    }
    roomName = JSON.parse(JSON.stringify(currentRoom._id))
    let messages = await db.collection(roomName).find().toArray()

    응답.render('chatRoom.ejs', {
        room: currentRoom,
        userID: 요청.body.userID,
        chat: messages
    })

})

app.post('/room/:next', async (요청, 응답) => {
    // const result = await db.collection('chatroom')
    //     .find({ creatUserID: { $ne: 요청.body.creatUserID } }).toArray();
    // let max = result.length - Number.EPSILON;
    // let randomInt = Math.floor(Math.random() * (max));
    // let currentRoom = result[randomInt]

    let currentRoom = await db.collection('chatroom').aggregate([
        { $match: { creatUserID: { $ne: 요청.body.creatUserID } } },
        { $sample: { size: 1 } }  // 랜덤하게 하나 선택
    ]).toArray()
    currentRoom = currentRoom[0]

    if (currentRoom.userID.includes(요청.body.userID)) {
    } else {
        let user = currentRoom.userID
        user.push(요청.body.userID)
        await db.collection('chatroom').updateOne(
            { _id: currentRoom._id },
            { $set: { userID: user }, $inc: { userNum: 1 } }
        )
        currentRoom = await db.collection('chatroom')
            .findOne({ userID: 요청.body.userID })
    }
    roomName = JSON.parse(JSON.stringify(currentRoom._id))
    let messages = await db.collection(roomName).find().toArray()

    응답.render('chatRoom.ejs', {
        room: currentRoom,
        userID: 요청.body.userID,
        chat: messages
    })
})

app.post('/page-leave', async (요청, 응답) => {
    db.collection('chatroom').updateOne(
        { _id: new ObjectId(요청.body.roomID) },
        {
            $pull: { userID: 요청.body.userID },
            $inc: { userNum: -1 }
        }
    );
    응답.sendStatus(200); // 클라이언트에 응답
});

io.on('connection', (socket) => {

    socket.on('ask-join', (roomID) => {
        socket.join(roomID)
        room = io.sockets.adapter.rooms.get(roomID);
        io.emit('room-size', room.size)
    })

    socket.on('message', async (data) => {
        await db.collection(data.roomID).insertOne({
            writer: data.user,
            message: data.msg,
            time: new Date()
        })
        io.to(data.roomID).emit('msg', { message: data.msg, user: data.user });
    })

}) 