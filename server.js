const express = require('express');
const app = express();
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const { createServer } = require('http');
const { Server } = require('socket.io');
const server = createServer(app);
const io = new Server(server);

let db;
let chatMessage = {};
let deleteTime = 5;
const url = process.env.DB_URL;
new MongoClient(url).connect().then((client) => {
    console.log('DB 연결 성공');
    db = client.db('persischat'); // 파일이름
    server.listen(8080, () => {
        console.log('http://localhost:8080');
    });
}).catch((err) => {
    console.log(err);
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// 세션 설정
app.use(session({
    secret: 'secretKey', // 보안을 위한 세션 암호화 키
    resave: false,
    saveUninitialized: false,
}));

// passport 초기화
app.use(passport.initialize());
app.use(passport.session());

// // passport local strategy 설정
// passport.use(new LocalStrategy({
//     usernameField: 'id', // 요청 body의 필드 이름
//     passwordField: 'password',
//     session: true
// }, async (id, password, done) => {
//     let user = await db.collection('user').findOne({ id: id });
//     if (!user) {
//         return done(null, false, { message: '존재하지 않는 아이디입니다.' });
//     }
//     let isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//         return done(null, false, { message: '비밀번호가 일치하지 않습니다.' });
//     }
//     return done(null, user);
// }));

// passport local strategy 설정
passport.use(new LocalStrategy({
    usernameField: 'id', // 요청 body의 필드 이름
    passwordField: 'password',
    session: true
}, async (id, password, done) => {
    try {
        let user = await db.collection('user').findOne({ id: id });
        if (!user) {
            return done(null, false, { message: '존재하지 않는 아이디입니다.' });
        }
        // 비밀번호가 암호화되지 않았으므로, 단순 문자열 비교
        if (password !== user.password) {
            return done(null, false, { message: '비밀번호가 일치하지 않습니다.' });
        }
        return done(null, user);
    } catch (error) {
        return done(error);
    }
}));


// 세션에 저장할 사용자 정보 설정
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// 세션에서 사용자 정보 복구
passport.deserializeUser(async (id, done) => {
    let user = await db.collection('user').findOne({ id: id });
    if (!user) return done(null, false);
    return done(null, user);
});

// 인증된 사용자만 접근 가능하게 하는 미들웨어
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
}

// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/signup', (req, res) => {
    res.render('signup.ejs');
});

// 회원가입 라우트
app.post('/signup', async (req, res) => {
    const { id, name, password, passwordConfirm } = req.body;

    // 비밀번호 확인
    if (password !== passwordConfirm) {
        return res.status(400).send('비밀번호가 일치하지 않습니다.');
    }

    // 아이디 중복 확인
    let existingUser = await db.collection('user').findOne({ id: id });
    if (existingUser) {
        return res.status(400).send('이미 존재하는 아이디입니다.');
    }

    // 회원정보 저장
    await db.collection('user').insertOne({
        id: id,
        name: name,
        password: password // 암호화하지 않은 비밀번호 저장
    });

    // 자동으로 유저를 위한 채팅방 생성
    await db.collection('chatroom').insertOne({
        creatUserID: id,
        userID: [id],
        date: new Date()
    });

    res.redirect('/');
});


// 로그인 라우트
app.post('/login', passport.authenticate('local', {
    successRedirect: '/list',
    failureRedirect: '/',
    failureFlash: false

}));

// 로그아웃 라우트
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

// 리스트 페이지
app.get('/list', isAuthenticated, async (req, res) => {
    let chatroom = await db.collection('chatroom').find().toArray();
    res.render('chatList.ejs', { userID: req.user, room: chatroom });
});

// 리스트 포스트 처리 (기존 라우터)
app.post('/list', async (req, res) => {
    let myRoom = await db.collection('chatroom').findOne({ creatUserID: req.body.id });
    if (!myRoom) {
        await db.collection('user').insertOne({
            id: req.body.id
        });
        await db.collection('chatroom').insertOne({
            creatUserID: req.body.id,
            userID: [req.body.id],
            date: new Date()
        });
    }
    let chatroom = await db.collection('chatroom').find().toArray();
    res.render('chatList.ejs', { userID: req.body.id, room: chatroom });
});

// 채팅방 입장 라우터
app.post('/room', async (req, res) => {
    let currentRoom = await db.collection('chatroom').findOne({ creatUserID: req.body.creatUserID });
    if (!currentRoom.userID.includes(req.body.userID)) {
        let user = currentRoom.userID;
        user.push(req.body.userID);
        await db.collection('chatroom').updateOne(
            { _id: currentRoom._id },
            { $set: { userID: user } }
        );
        currentRoom = await db.collection('chatroom').findOne({ userID: req.body.userID });
    }
    let roomID = currentRoom._id.toString();
    let preMessage = chatMessage[roomID];
    res.render('chatRoom.ejs', {
        room: currentRoom,
        userID: req.body.userID,
        chat: preMessage ? preMessage : []
    });
});

// 랜덤 채팅방 입장 라우터
app.post('/room/:next', async (req, res) => {
    let currentRoom = await db.collection('chatroom').aggregate([
        { $match: { creatUserID: { $ne: req.body.creatUserID } } },
        { $sample: { size: 1 } }
    ]).toArray();
    currentRoom = currentRoom[0];
    let user = currentRoom.userID;
    user.push(req.body.userID);
    await db.collection('chatroom').updateOne(
        { _id: currentRoom._id },
        { $set: { userID: user } }
    );
    currentRoom = await db.collection('chatroom').findOne({ userID: req.body.userID });
    let roomID = currentRoom._id.toString();
    let preMessage = chatMessage[roomID];
    if (!preMessage) {
        preMessage = [];
    }
    res.render('chatRoom.ejs', {
        room: currentRoom,
        userID: req.body.userID,
        chat: preMessage
    });
});

// 페이지 떠나기 라우터
app.post('/page-leave', async (req, res) => {
    await db.collection('chatroom').updateOne(
        { _id: new ObjectId(req.query.roomID) },
        { $pull: { userID: req.query.userID } }
    );
    res.sendStatus(200);
});

// 소켓 통신
io.on('connection', (socket) => {
    socket.on('ask-join', (roomID) => {
        socket.join(roomID);
        if (!chatMessage[roomID]) {
            chatMessage[roomID] = [];
        }
        room = io.sockets.adapter.rooms.get(roomID);
        io.to(roomID).emit('room-size', room.size);
    });

    socket.on('message', async (data) => {
        let currentTime = new Date();
        let message = { userID: data.user, text: data.text, time: currentTime };
        chatMessage[data.roomID].push(message);
        await db.collection(data.roomID).insertOne({
            writer: data.user,
            message: data.text,
            time: currentTime
        });
        io.to(data.roomID).emit('msg', { message: data.text, user: data.user });

        setTimeout(async () => {
            chatMessage[data.roomID].shift();
            io.to(data.roomID).emit('delete-message', { message: data.text, user: data.user });
        }, 1000 * deleteTime);
    });

    socket.on('leave-page', (roomID) => {
        room = io.sockets.adapter.rooms.get(roomID);
        io.to(roomID).emit('room-size', room.size - 1);
    });
});
