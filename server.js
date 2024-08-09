const express = require('express')
const app = express()

// app.use(express.static(path.join(__dirname + '/public')))
app.use(express.static('public'))

app.listen(8080, () => {
    console.log('http://localhost:8080')
})

app.get('/', (요청, 응답) => {
    응답.redirect('/1')
})

app.get('/:rooms', (요청, 응답) => {
    let room = 요청.params.rooms
    room += 1
    응답.sendFile(__dirname + '/index.html')
})