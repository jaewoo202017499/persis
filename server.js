const express = require('express')
const app = express()

const { MongoClient } = require('mongodb')
require('dotenv').config()

const { createServer } = require('http')
const { Server } = require('socket.io')
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
    응답.render('chatRoom.ejs', { 아이디: '안녕' })
    // 응답.redirect('/chat/1')
})

// app.get('/chat/:rooms', (요청, 응답) => {
//     let room = 요청.params.rooms
//     room += 1
//     응답.sendFile(__dirname + '/index.html')
// })

app.get('/news', (요청, 응답) => {
    db.collection('chat').insertOne({ title: '어쩌구' })
    응답.send('데이터~~~')
})

app.get('/chat', (요청, 응답) => {
    응답.render('chatRoom.ejs', { result: "안녕" })
})

app.post('/chat', (요청, 응답) => {
    응답.render('chatRoom.ejs', { 아이디: 요청.body.id })
})

io.on('connection', (socket) => {

    socket.on('name', (data) => {
        console.log('유저가 보낸거 : ', data)
    })
    io.emit('age', '20')

}) 