const { Client } = require("whatsapp-web.js");
const express = require("express");
const { body, validationResult } = require("express-validator");
const socketIO = require("socket.io");
const qrcode = require("qrcode");
const http = require("http");
const fs = require("fs");
const { phoneNumberFormatter } = require("./helper/formatter");
const { url } = require("inspector");
const { response } = require("express");
const post = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SESSION_FILE_PATH = "./whatsapp-session.json";
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
  sessionCfg = require(SESSION_FILE_PATH);
}

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: __dirname });
});

const client = new Client({
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // <- this one doesn't works in Windows
      "--disable-gpu",
    ],
  },
  session: sessionCfg,
});

let menu1 = "";
let menu2 = "oke";

client.on("message", (msg) => {
  if (msg.body == "menu") {
    msg.reply(
      "Selamat Datang Di Whatsapp Gateway Imigrasi Silahkan Tekan 1/2/3/4"
    );
  } else if (msg.body == "1") {
    msg.reply(menu1);
  } else if (msg.body == "2") {
    msg.reply("menu 2");
  } else if (msg.body == "3") {
    msg.reply("menu 3");
  } else if (msg.body == "4") {
    msg.reply("menu 4");
  }
});

client.initialize();

//Socket IO
io.on("connection", function (socket) {
  socket.emit("message", "Connection...");

  client.on("qr", (qr) => {
    console.log("QR RECEIVED", qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit("qr", url);
      socket.emit("message", "QR Code received, Scan please...!");
    });
  });

  client.on("ready", () => {
    socket.emit("ready", "Whatsapp Gateway is ready...");
    socket.emit("message", "Whatsapp Gateway is ready...");
  });

  client.on("authenticated", (session) => {
    socket.emit("authenticated", "Whatsapp Gateway is authenticated...");
    socket.emit("message", "Whatsapp Gateway is authenticated...");
    console.log("AUTHENTICATED", session);
    sessionCfg = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
      if (err) {
        console.error(err);
      }
    });
  });

  client.on("auth_failure", function (session) {
    socket.emit("message", "Auth failure, restarting...");
  });

  client.on("disconnected", (reason) => {
    socket.emit("message", "Whatsapp is disconnected!");
    fs.unlinkSync(SESSION_FILE_PATH, function (err) {
      if (err) return console.log(err);
      console.log("Session file deleted!");
    });
    client.destroy();
    client.initialize();
  });
});

//Verifikasi No. Hp
const checkRegisteredNumber = function (number) {
  const isRegistered = client.isRegisteredUser(number);
  return isRegistered;
};

// Send Message
app.post(
  "/send-message",
  [body("number").notEmpty(), body("message").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req).formatWith(({ msg }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped(),
      });
    }
    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisteredNumber(number);

    if (!isRegisteredNumber) {
      return res.status(422).json({
        status: false,
        message: "The number is not registered",
      });
    }

    client
      .sendMessage(number, message)
      .then((response) => {
        res.status(200).json({
          status: true,
          response: response,
        });
      })
      .catch((err) => {
        res.status(500).json({
          status: false,
          response: err,
        });
      });
  }
);

server.listen(port, function () {
  console.log("App running on *: " + port);
});
