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
let chatMessage = {}
let deleteTime = 5
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
app.get('/list', async (요청, 응답) => {
    let chatroom = await db.collection('chatroom').find().toArray()
    응답.render('chatList.ejs', { userID: 요청.query.id, room: chatroom })
})

app.post('/list', async (요청, 응답) => {

    // 계정 새로 만든 경우 방 만들기
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
            date: new Date()
        })
        console.log('계정 새로 만들었음')
    }
    // 전체 채팅방 공유하기
    let chatroom = await db.collection('chatroom').find().toArray()
    응답.render('chatList.ejs', { userID: 요청.body.id, room: chatroom })
})

app.post('/room', async (요청, 응답) => {
    let currentRoom = await db.collection('chatroom')
        .findOne({ creatUserID: 요청.body.creatUserID })
    // 랜덤으로 돌릴때 내가 속하지 않은곳으로 이동하기
    if (currentRoom.userID.includes(요청.body.userID)) {
    } else {
        let user = currentRoom.userID
        user.push(요청.body.userID)
        await db.collection('chatroom').updateOne(
            { _id: currentRoom._id },
            {
                $set: { userID: user },
            }
        )
        currentRoom = await db.collection('chatroom')
            .findOne({ userID: 요청.body.userID })
    }
    // 이전 메시지 불러오기
    let roomID = currentRoom._id.toString()
    let preMessage = chatMessage[roomID]
    응답.render('chatRoom.ejs', {
        room: currentRoom,
        userID: 요청.body.userID,
        chat: preMessage ? preMessage : []
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

    // 랜덤채팅방 돌리기
    let user = currentRoom.userID
    user.push(요청.body.userID)
    await db.collection('chatroom').updateOne(
        { _id: currentRoom._id },
        { $set: { userID: user } })
    currentRoom = await db.collection('chatroom')
        .findOne({ userID: 요청.body.userID })

    // 이전 메시지 불러오기
    let roomID = currentRoom._id.toString()
    let preMessage = chatMessage[roomID]

    응답.render('chatRoom.ejs', {
        room: currentRoom,
        userID: 요청.body.userID,
        chat: preMessage ? preMessage : []
    })
})

app.post('/page-leave', async (요청, 응답) => {
    db.collection('chatroom').updateOne(
        { _id: new ObjectId(요청.query.roomID) },
        {
            $pull: { userID: 요청.query.userID },
        }
    );
    응답.sendStatus(200); // 클라이언트에 응답
});

io.on('connection', (socket) => {

    socket.on('ask-join', (roomID) => {
        socket.join(roomID)
        if (!chatMessage[roomID]) {
            chatMessage[roomID] = []
        }
        room = io.sockets.adapter.rooms.get(roomID);
        io.to(roomID).emit('room-size', room.size)
    })

    socket.on('message', async (data) => {
        // 서버에저장
        let currentTime = new Date()
        let message = { userID: data.user, text: data.text, time: currentTime }
        chatMessage[data.roomID].push(message)
        console.log(chatMessage[data.roomID])

        // DB저장
        await db.collection(data.roomID).insertOne({
            writer: data.user,
            message: data.msg,
            time: currentTime
        })
        io.to(data.roomID).emit('msg', { message: data.text, user: data.user });

        // 채팅지우기
        setTimeout(async () => {
            console.log(data.roomID)
            chatMessage[data.roomID].shift()
            // chatMessage[data.roomID].
            io.to(data.roomID).emit('delete-message', { message: data.text, user: data.user })
        }, 1000 * deleteTime); // 60000 밀리초 = 1분
    })

    socket.on('leave-page', (roomID) => {
        console.log(roomID)
        room = io.sockets.adapter.rooms.get(roomID);
        console.log(room.size - 1)
        io.to(roomID).emit('room-size', room.size - 1)
    })

}) 