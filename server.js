require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = 3000;

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "supersecretkey",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.discordOAuthURL = discordOAuthURL;
  next();
});

const discordOAuthURL = `https://discord.com/api/oauth2/authorize?client_id=${
  process.env.CLIENT_ID
}&redirect_uri=${encodeURIComponent(
  process.env.REDIRECT_URI
)}&response_type=code&scope=identify`;

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/servers", (req, res) => {
  if (!req.session.user) return res.redirect("/");
  const manageableGuilds = (req.session.guilds || []).filter(
    (guild) => (guild.permissions & 0x20) === 0x20
  );
  res.render("servers", { guilds: manageableGuilds });
});

app.get("/auth/discord", async (req, res) => {
  if (!req.query.code) return res.redirect("/");

  try {
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        code: req.query.code,
        redirect_uri: process.env.REDIRECT_URI,
        scope: "identify guilds",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const guildsResponse = await axios.get(
      "https://discord.com/api/users/@me/guilds",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    req.session.user = userResponse.data;
    req.session.guilds = guildsResponse.data; // Guardamos los servidores en la sesión

    res.redirect("/servers"); // Redirige a la página de servidores
  } catch (error) {
    console.error("Error en la autenticación:", error);
    res.redirect("/");
  }
});

app.get("/auth/success", (req, res) => {
  console.log("Auth Success - Query Params:", req.query); // Ver qué parámetros llegan
  const guildId = req.query.guild_id;
  if (!guildId) return res.redirect("/servers");

  res.redirect(`/dashboard/${guildId}`);
});

app.get("/dashboard/:guildId", async (req, res) => {
  if (!req.session.user) {
    console.log("Usuario no autenticado, redirigiendo...");
    return res.redirect("/");
  }

  const guildId = req.params.guildId;
  console.log(`Cargando dashboard del servidor: ${guildId}`);

  try {
    const guildResponse = await axios.get(
      `https://discord.com/api/guilds/${guildId}`,
      {
        headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` },
      }
    );

    const guild = guildResponse.data;
    console.log("Datos del servidor obtenidos:", guild);

    res.render("dashboard", { user: req.session.user, guild });
  } catch (error) {
    console.error("Error obteniendo información del servidor:", error);
    res.redirect("/servers");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
