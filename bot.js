// bot.js - VERSIÓN CORREGIDA PARA RAILWAY
console.log('🚀 Bot iniciando en Railway...');

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');

// ================== CONFIGURACIÓN FIREBASE CORREGIDA ==================
console.log('🔍 Verificando variables de entorno...');

// Verificar TODAS las variables primero
const requiredVars = {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL
};

// Debug: mostrar estado de variables (sin mostrar valores completos por seguridad)
console.log('📋 Estado de variables:');
Object.keys(requiredVars).forEach(key => {
    const value = requiredVars[key];
    if (value) {
        console.log(`   ✅ ${key}: PRESENTE (${value.length} caracteres)`);
    } else {
        console.log(`   ❌ ${key}: AUSENTE`);
    }
});

// Verificar si falta alguna variable
const missingVars = Object.keys(requiredVars).filter(key => !requiredVars[key]);
if (missingVars.length > 0) {
    console.log('\n❌ ERROR: Faltan variables de entorno:');
    missingVars.forEach(varName => console.log(`   - ${varName}`));
    console.log('\n📝 Cómo solucionar en Railway:');
    console.log('   1. Ve a https://railway.app');
    console.log('   2. Selecciona tu proyecto');
    console.log('   3. Haz clic en "Variables"');
    console.log('   4. Agrega las variables faltantes');
    console.log('   5. Haz clic en "Deploy" para reiniciar');
    process.exit(1);
}

// CONFIGURACIÓN FIREBASE - VERSIÓN CORREGIDA
try {
    // IMPORTANTE: Formatear correctamente la clave privada
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    
    // Reemplazar \\n por \n si es necesario (para Railway)
    if (privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
    }
    
    // Asegurarse de que la clave tenga el formato correcto
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        console.log('⚠️ ADVERTENCIA: La clave privada no tiene el formato esperado');
    }
    
    console.log('🔑 Configurando Firebase...');
    
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    
    console.log('✅ Firebase conectado correctamente');
    
} catch (error) {
    console.log('❌ ERROR en configuración de Firebase:');
    console.log('   Mensaje:', error.message);
    console.log('   Stack:', error.stack ? error.stack.substring(0, 200) + '...' : 'No disponible');
    console.log('\n🔧 Solución:');
    console.log('   1. Verifica que la clave privada sea la correcta');
    console.log('   2. Asegúrate de copiar TODO el contenido del JSON de Firebase');
    console.log('   3. En Railway, pega la clave COMPLETA en una sola línea');
    process.exit(1);
}

const db = admin.database();
console.log('🗄️  Base de datos Firebase lista');

// ================== CLIENTE WHATSAPP ==================
const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'bot-sv-firebase' }),
    puppeteer: { 
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// ================== FUNCIONES FIREBASE ==================
class FirebaseManager {
    // Guardar programación
    static async guardarProgramacion(programa) {
        try {
            const ref = db.ref('programaciones').push();
            programa.id = ref.key;
            programa.creado = new Date().toISOString();
            programa.activo = true;
            
            await ref.set(programa);
            return programa.id;
        } catch (error) {
            console.error('Error guardando en Firebase:', error);
            return null;
        }
    }
    
    // Obtener todas las programaciones
    static async obtenerProgramaciones() {
        try {
            const snapshot = await db.ref('programaciones').once('value');
            const programaciones = [];
            
            snapshot.forEach(child => {
                const prog = child.val();
                if (prog.activo) programaciones.push(prog);
            });
            
            return programaciones;
        } catch (error) {
            console.error('Error obteniendo programaciones:', error);
            return [];
        }
    }
    
    // Obtener programaciones por hora
    static async obtenerProgramacionesPorHora(hora) {
        try {
            const snapshot = await db.ref('programaciones').orderByChild('hora').equalTo(hora).once('value');
            const programaciones = [];
            
            snapshot.forEach(child => {
                const prog = child.val();
                if (prog.activo) programaciones.push(prog);
            });
            
            return programaciones;
        } catch (error) {
            console.error('Error obteniendo programaciones por hora:', error);
            return [];
        }
    }
    
    // Guardar grupo
    static async guardarGrupo(grupoId, nombre) {
        try {
            const safeId = grupoId.replace(/[.#$\[\]]/g, '_');
            await db.ref('grupos').child(safeId).set({
                id: grupoId,
                nombre: nombre || 'Sin nombre',
                activo: true,
                agregado: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Error guardando grupo:', error);
            return false;
        }
    }
    
    // Obtener todos los grupos
    static async obtenerGrupos() {
        try {
            const snapshot = await db.ref('grupos').once('value');
            const grupos = [];
            
            snapshot.forEach(child => {
                const grupo = child.val();
                if (grupo.activo) grupos.push(grupo);
            });
            
            return grupos;
        } catch (error) {
            console.error('Error obteniendo grupos:', error);
            return [];
        }
    }
    
    // Guardar administrador
    static async agregarAdmin(numero) {
        try {
            const safeNumero = numero.replace(/[.#$\[\]]/g, '_');
            await db.ref('administradores').child(safeNumero).set({
                numero: numero,
                fecha: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Error agregando admin:', error);
            return false;
        }
    }
    
    // Verificar si es administrador
    static async esAdmin(numero) {
        try {
            const safeNumero = numero.replace(/[.#$\[\]]/g, '_');
            const snapshot = await db.ref('administradores').child(safeNumero).once('value');
            return snapshot.exists();
        } catch (error) {
            console.error('Error verificando admin:', error);
            return false;
        }
    }
    
    // Buscar en base de datos
    static async buscar(keyword) {
        try {
            const resultados = [];
            
            const snapshot = await db.ref('programaciones').once('value');
            snapshot.forEach(child => {
                const prog = child.val();
                if (prog.nombre && prog.nombre.toLowerCase().includes(keyword.toLowerCase())) {
                    resultados.push({
                        tipo: 'programación',
                        nombre: prog.nombre,
                        hora: prog.hora,
                        id: prog.id
                    });
                }
            });
            
            return resultados;
        } catch (error) {
            console.error('Error buscando:', error);
            return [];
        }
    }
    
    // Eliminar programación
    static async eliminarProgramacion(id) {
        try {
            await db.ref('programaciones').child(id).update({ activo: false });
            return true;
        } catch (error) {
            console.error('Error eliminando programación:', error);
            return false;
        }
    }
}

// ================== SISTEMA DE PROGRAMACIÓN ==================
class Programador {
    constructor() {
        this.programacionesActivas = new Map();
        this.iniciarProgramador();
        console.log('⏰ Programador inicializado');
    }
    
    iniciarProgramador() {
        // Verificar cada minuto
        setInterval(async () => {
            try {
                const ahora = new Date();
                const horaSV = new Date(ahora.toLocaleString('en-US', { 
                    timeZone: 'America/El_Salvador' 
                }));
                const horaActual = horaSV.getHours().toString().padStart(2, '0');
                const minutoActual = horaSV.getMinutes().toString().padStart(2, '0');
                const horaCompleta = `${horaActual}:${minutoActual}`;
                
                console.log(`🕐 Verificando programaciones para las ${horaCompleta} (SV)`);
                
                const programaciones = await FirebaseManager.obtenerProgramacionesPorHora(horaCompleta);
                
                if (programaciones.length > 0) {
                    console.log(`📤 Enviando ${programaciones.length} programaciones`);
                    for (const programa of programaciones) {
                        await this.ejecutarPrograma(programa);
                    }
                }
            } catch (error) {
                console.error('Error en programador:', error);
            }
        }, 60000); // Cada minuto
        
        console.log('⏰ Programador iniciado - Hora El Salvador');
    }
    
    async ejecutarPrograma(programa) {
        try {
            const grupos = await FirebaseManager.obtenerGrupos();
            
            if (grupos.length === 0) {
                console.log('⚠️ No hay grupos registrados');
                return;
            }
            
            for (const grupo of grupos) {
                try {
                    const chat = await client.getChatById(grupo.id);
                    
                    if (programa.imagenUrl) {
                        await chat.sendMessage(programa.mensaje || '📷 Imagen programada', {
                            media: programa.imagenUrl
                        });
                    } else {
                        await chat.sendMessage(programa.mensaje);
                    }
                    
                    console.log(`✅ Enviado a "${grupo.nombre}"`);
                } catch (error) {
                    console.error(`Error enviando a grupo ${grupo.nombre}:`, error.message);
                }
            }
        } catch (error) {
            console.error('Error ejecutando programa:', error);
        }
    }
}

// ================== MANEJADOR DE COMANDOS ==================
class ComandoHandler {
    static async handle(message, texto, usuario, esGrupo) {
        const args = texto.split(' ');
        const comando = args[0].toLowerCase();
        
        console.log(`🤖 Comando recibido: ${comando} de ${usuario}`);
        
        try {
            switch(comando) {
                case 'menu':
                    await this.menu(message);
                    break;
                    
                case 'programar':
                    await this.programar(message, args, usuario);
                    break;
                    
                case 'misprogramas':
                    await this.misProgramas(message, usuario);
                    break;
                    
                case 'cancelar':
                    await this.cancelarPrograma(message, args);
                    break;
                    
                case 'grupos':
                    await this.listarGrupos(message);
                    break;
                    
                case 'buscar':
                    await this.buscar(message, args);
                    break;
                    
                case 'admin':
                    await this.admin(message, args, usuario);
                    break;
                    
                case 'hora':
                    await this.hora(message);
                    break;
                    
                case 'ayuda':
                    await this.ayuda(message);
                    break;
                    
                case 'estado':
                    await this.estado(message);
                    break;
                    
                default:
                    if (!esGrupo) {
                        await message.reply('Comando no reconocido. Escribe *menu* para ver opciones.');
                    }
            }
        } catch (error) {
            console.error('Error manejando comando:', error);
            if (!esGrupo) {
                await message.reply('❌ Error procesando comando. Intenta de nuevo.');
            }
        }
    }
    
    static async menu(message) {
        const menu = `📋 *BOT WHATSAPP - FIREBASE*\n\n` +
                    `👤 *COMANDOS GENERALES:*\n` +
                    `• menu - Ver este menú\n` +
                    `• hora - Hora El Salvador\n` +
                    `• ayuda - Instrucciones\n` +
                    `• buscar [palabra] - Buscar programas\n` +
                    `• estado - Estado del bot\n\n` +
                    `👑 *PROGRAMACIÓN:*\n` +
                    `• programar - Crear nueva programación\n` +
                    `• misprogramas - Ver mis programas\n` +
                    `• cancelar [id] - Cancelar programa\n\n` +
                    `👥 *GRUPOS:*\n` +
                    `• grupos - Listar grupos activos\n\n` +
                    `⚙️ *ADMIN:*\n` +
                    `• admin add [número] - Agregar admin`;
        
        await message.reply(menu);
    }
    
    static async programar(message, args, usuario) {
        const esAdmin = await FirebaseManager.esAdmin(usuario);
        if (!esAdmin) {
            await message.reply('❌ Solo administradores pueden programar.');
            return;
        }
        
        await message.reply(`📝 *PROGRAMAR NUEVA IMAGEN/MENSAJE*\n\n` +
                          `Responde a este mensaje en orden:\n\n` +
                          `1. *NOMBRE:* Nombre de la programación\n` +
                          `2. *HORA:* Hora en formato HH:MM (24h)\n` +
                          `3. *IMAGEN:* Envía la imagen\n` +
                          `4. *MENSAJE:* Texto acompañante\n\n` +
                          `Ejemplo de respuesta:\n` +
                          `"Buenos días\\n09:00\\nBuen día grupo!"`);
    }
    
    static async misProgramas(message, usuario) {
        const esAdmin = await FirebaseManager.esAdmin(usuario);
        
        if (!esAdmin) {
            await message.reply('❌ Solo administradores pueden ver programas.');
            return;
        }
        
        const programaciones = await FirebaseManager.obtenerProgramaciones();
        
        if (programaciones.length === 0) {
            await message.reply('📭 No hay programaciones activas.');
            return;
        }
        
        let lista = `📋 *PROGRAMACIONES ACTIVAS (${programaciones.length})*\n\n`;
        
        programaciones.forEach((prog, index) => {
            lista += `*${index + 1}. ${prog.nombre || 'Sin nombre'}*\n`;
            lista += `🆔 ID: ${prog.id}\n`;
            lista += `🕐 Hora: ${prog.hora}\n`;
            lista += `💬 Mensaje: ${prog.mensaje?.substring(0, 50) || 'Sin mensaje'}...\n`;
            lista += `📅 Creado: ${new Date(prog.creado).toLocaleDateString('es-SV')}\n`;
            lista += `📝 Cancelar: *cancelar ${prog.id}*\n\n`;
        });
        
        await message.reply(lista);
    }
    
    static async cancelarPrograma(message, args) {
        if (args.length < 2) {
            await message.reply('❌ Uso: *cancelar [ID]*');
            return;
        }
        
        const id = args[1];
        const usuario = message.from;
        const esAdmin = await FirebaseManager.esAdmin(usuario);
        
        if (!esAdmin) {
            await message.reply('❌ Solo administradores pueden cancelar programas.');
            return;
        }
        
        const eliminado = await FirebaseManager.eliminarProgramacion(id);
        
        if (eliminado) {
            await message.reply(`✅ Programación ${id} cancelada correctamente.`);
        } else {
            await message.reply(`❌ No se pudo cancelar la programación ${id}.`);
        }
    }
    
    static async listarGrupos(message) {
        const grupos = await FirebaseManager.obtenerGrupos();
        
        if (grupos.length === 0) {
            await message.reply('📭 No hay grupos registrados.\n\nEscribe "activar bot" en un grupo para registrarlo.');
            return;
        }
        
        let lista = `👥 *GRUPOS ACTIVOS (${grupos.length})*\n\n`;
        
        grupos.forEach((grupo, index) => {
            lista += `*${index + 1}. ${grupo.nombre || 'Sin nombre'}*\n`;
            lista += `📅 Agregado: ${new Date(grupo.agregado).toLocaleDateString('es-SV')}\n\n`;
        });
        
        await message.reply(lista);
    }
    
    static async buscar(message, args) {
        if (args.length < 2) {
            await message.reply('❌ Uso: *buscar [palabra clave]*');
            return;
        }
        
        const keyword = args.slice(1).join(' ');
        const resultados = await FirebaseManager.buscar(keyword);
        
        if (resultados.length === 0) {
            await message.reply(`🔍 No se encontraron resultados para "${keyword}"`);
            return;
        }
        
        let respuesta = `🔍 *RESULTADOS PARA "${keyword}"*\n\n`;
        
        resultados.forEach((item, index) => {
            respuesta += `*${index + 1}. ${item.tipo.toUpperCase()}*\n`;
            respuesta += `📝 ${item.nombre}\n`;
            if (item.hora) respuesta += `🕐 ${item.hora}\n`;
            respuesta += `🆔 ID: ${item.id}\n\n`;
        });
        
        await message.reply(respuesta);
    }
    
    static async admin(message, args, usuario) {
        const esAdmin = await FirebaseManager.esAdmin(usuario);
        
        if (!esAdmin) {
            await message.reply('❌ Solo administradores pueden usar este comando.');
            return;
        }
        
        if (args.length < 3 || args[1] !== 'add') {
            await message.reply('❌ Uso: *admin add [número]*\nEjemplo: *admin add 77777777*');
            return;
        }
        
        let numero = args[2];
        if (!numero.includes('@')) {
            numero = numero.replace(/\D/g, '');
            if (!numero.startsWith('503')) {
                numero = '503' + numero;
            }
            numero = numero + '@c.us';
        }
        
        const agregado = await FirebaseManager.agregarAdmin(numero);
        
        if (agregado) {
            await message.reply(`✅ Administrador agregado: ${numero}`);
        } else {
            await message.reply(`❌ Error agregando administrador.`);
        }
    }
    
    static async hora(message) {
        const ahora = new Date();
        const horaSV = new Date(ahora.toLocaleString('en-US', { 
            timeZone: 'America/El_Salvador' 
        }));
        
        await message.reply(`🕐 *HORA EL SALVADOR:*\n${horaSV.toLocaleTimeString('es-SV')}\n📅 ${horaSV.toLocaleDateString('es-SV')}`);
    }
    
    static async ayuda(message) {
        const ayuda = `🤖 *AYUDA - BOT WHATSAPP FIREBASE*\n\n` +
                     `*¿CÓMO USAR?*\n` +
                     `1. Agrega el bot a un grupo\n` +
                     `2. Escribe "activar bot" en el grupo\n` +
                     `3. Usa los comandos desde cualquier chat\n\n` +
                     `*COMANDOS PRINCIPALES:*\n` +
                     `• programar - Crear envíos automáticos\n` +
                     `• buscar - Encontrar programas\n` +
                     `• grupos - Ver grupos activos\n\n` +
                     `*CARACTERÍSTICAS:*\n` +
                     `✅ Funciona 24/7 en Railway\n` +
                     `✅ Base de datos en Firebase\n` +
                     `✅ Hora El Salvador automática\n` +
                     `✅ Múltiples administradores`;
        
        await message.reply(ayuda);
    }
    
    static async estado(message) {
        const grupos = await FirebaseManager.obtenerGrupos();
        const programaciones = await FirebaseManager.obtenerProgramaciones();
        
        const estado = `📊 *ESTADO DEL BOT*\n\n` +
                      `🔌 Conectado: ${client.info ? '✅' : '❌'}\n` +
                      `👥 Grupos activos: ${grupos.length}\n` +
                      `⏰ Programaciones: ${programaciones.length}\n` +
                      `🗄️  Firebase: ✅ Conectado\n` +
                      `🚀 Plataforma: Railway`;
        
        await message.reply(estado);
    }
}

// ================== EVENTOS PRINCIPALES ==================
client.on('qr', qr => {
    console.log('\n📱 ESCANEA ESTE QR CON WHATSAPP:');
    qrcode.generate(qr, { small: true });
    console.log('\n✅ Escanea con WhatsApp Web');
});

client.on('ready', async () => {
    console.log('\n' + '='.repeat(50));
    console.log('✅ BOT CONECTADO Y LISTO');
    console.log(`📱 Usuario: ${client.info.pushname}`);
    console.log(`📞 Número: ${client.info.wid.user}`);
    console.log('🔥 Firebase: Conectado');
    console.log('⏰ Programador: Iniciado');
    console.log('='.repeat(50) + '\n');
    
    // Iniciar programador
    new Programador();
    
    // Agregar primer admin automáticamente (solo si no hay admins)
    try {
        const snapshot = await db.ref('administradores').once('value');
        if (!snapshot.exists() || snapshot.numChildren() === 0) {
            const chats = await client.getChats();
            for (const chat of chats) {
                if (!chat.isGroup) {
                    await FirebaseManager.agregarAdmin(chat.id._serialized);
                    console.log(`👑 Admin agregado automáticamente: ${chat.id._serialized}`);
                    break;
                }
            }
        }
    } catch (error) {
        console.error('Error agregando admin automático:', error);
    }
});

client.on('message', async message => {
    const texto = message.body.trim();
    const usuario = message.from;
    const esGrupo = message.from.includes('@g.us');
    
    // Ignorar mensajes del bot
    if (message.fromMe) return;
    
    console.log(`📨 [${esGrupo ? 'GRUPO' : 'PRIV'}] ${usuario}: ${texto.substring(0, 50)}`);
    
    // Activar en grupo
    if (texto.toLowerCase().includes('activar bot') && esGrupo) {
        try {
            const chat = await message.getChat();
            const guardado = await FirebaseManager.guardarGrupo(message.from, chat.name);
            
            if (guardado) {
                await message.reply('✅ *BOT ACTIVADO EN ESTE GRUPO!*\n\nLos mensajes programados se enviarán aquí automáticamente.');
            } else {
                await message.reply('❌ Error activando el bot. Intenta de nuevo.');
            }
        } catch (error) {
            console.error('Error activando bot en grupo:', error);
            await message.reply('❌ Error activando el bot.');
        }
        return;
    }
    
    // Manejar comandos (prefijo !)
    if (texto.startsWith('!')) {
        await ComandoHandler.handle(message, texto.substring(1), usuario, esGrupo);
    }
    
    // Interacciones automáticas
    else if (!esGrupo) {
        if (texto.toLowerCase().includes('hola') || texto.toLowerCase().includes('hello')) {
            await message.reply('¡Hola! 👋 Escribe *!menu* para ver todas las opciones.');
        }
    }
});

client.on('disconnected', (reason) => {
    console.log('⚠️ Bot desconectado:', reason);
    console.log('🔄 Reiniciando en 5 segundos...');
    setTimeout(() => {
        console.log('🔄 Reiniciando bot...');
        client.initialize();
    }, 5000);
});

client.on('auth_failure', (msg) => {
    console.log('❌ Error de autenticación:', msg);
});

client.on('authenticated', () => {
    console.log('🔑 Autenticación exitosa');
});

// ================== INICIAR BOT ==================
console.log('\n' + '='.repeat(50));
console.log('🚀 INICIANDO BOT WHATSAPP CON FIREBASE');
console.log('📍 Hora El Salvador configurada');
console.log('🗄️  Firebase configurado');
console.log('='.repeat(50) + '\n');

// Iniciar cliente
client.initialize();

// Manejar cierre
process.on('SIGINT', () => {
    console.log('\n👋 Bot detenido. Los datos están seguros en Firebase.');
    client.destroy();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('⚠️ Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Promesa rechazada no manejada:', reason);
});
