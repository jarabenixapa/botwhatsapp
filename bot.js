// bot.js - VERSIÓN PARA RAILWAY
console.log('🚀 Bot iniciando en Railway...');

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');

// CONFIGURACIÓN FIREBASE PARA RAILWAY
try {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.log('✅ Firebase conectado');
} catch (error) {
    console.log('❌ Error Firebase:', error.message);
    process.exit(1);
}

const db = admin.database();

// ... EL RESTO DE TU CÓDIGO QUEDA IGUAL ...
// TODO lo que viene después de "const db = admin.database();"

// ================== CLIENTE WHATSAPP ==================
const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'bot-sv-firebase' }),
    puppeteer: { 
        headless: false,
        args: ['--no-sandbox']
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
            return [];
        }
    }
    
    // Guardar grupo
    static async guardarGrupo(grupoId, nombre) {
        try {
            await db.ref('grupos').child(grupoId.replace(/[.#$\[\]]/g, '_')).set({
                id: grupoId,
                nombre: nombre,
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
            return [];
        }
    }
    
    // Guardar administrador
    static async agregarAdmin(numero) {
        try {
            await db.ref('administradores').child(numero.replace(/[.#$\[\]]/g, '_')).set({
                numero: numero,
                fecha: new Date().toISOString()
            });
            return true;
        } catch (error) {
            return false;
        }
    }
    
    // Verificar si es administrador
    static async esAdmin(numero) {
        try {
            const snapshot = await db.ref('administradores').child(numero.replace(/[.#$\[\]]/g, '_')).once('value');
            return snapshot.exists();
        } catch (error) {
            return false;
        }
    }
    
    // Buscar en base de datos
    static async buscar(keyword) {
        try {
            const resultados = [];
            
            // Buscar en programaciones
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
            return [];
        }
    }
    
    // Eliminar programación
    static async eliminarProgramacion(id) {
        try {
            await db.ref('programaciones').child(id).update({ activo: false });
            return true;
        } catch (error) {
            return false;
        }
    }
}

// ================== SISTEMA DE PROGRAMACIÓN ==================
class Programador {
    constructor() {
        this.programacionesActivas = new Map();
        this.iniciarProgramador();
    }
    
    iniciarProgramador() {
        // Verificar cada minuto
        setInterval(async () => {
            const ahora = new Date();
            const horaSV = new Date(ahora.toLocaleString('en-US', { 
                timeZone: 'America/El_Salvador' 
            }));
            const horaActual = horaSV.getHours().toString().padStart(2, '0');
            const minutoActual = horaSV.getMinutes().toString().padStart(2, '0');
            const horaCompleta = `${horaActual}:${minutoActual}`;
            
            // Obtener programaciones para esta hora
            const programaciones = await FirebaseManager.obtenerProgramacionesPorHora(horaCompleta);
            
            for (const programa of programaciones) {
                await this.ejecutarPrograma(programa);
            }
        }, 60000); // Cada minuto
        
        console.log('⏰ Programador iniciado - Hora El Salvador');
    }
    
    async ejecutarPrograma(programa) {
        try {
            const grupos = await FirebaseManager.obtenerGrupos();
            
            for (const grupo of grupos) {
                const chat = await client.getChatById(grupo.id);
                
                if (programa.imagenUrl) {
                    // Enviar imagen
                    await chat.sendMessage(programa.mensaje || '📷 Imagen programada', {
                        media: programa.imagenUrl
                    });
                } else {
                    // Enviar solo mensaje
                    await chat.sendMessage(programa.mensaje);
                }
                
                console.log(`✅ Enviado a ${grupo.nombre}`);
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
                
            default:
                if (!esGrupo) {
                    await message.reply('Comando no reconocido. Escribe *menu* para ver opciones.');
                }
        }
    }
    
    static async menu(message) {
        const menu = `📋 *BOT WHATSAPP - FIREBASE*\n\n` +
                    `👤 *COMANDOS GENERALES:*\n` +
                    `• menu - Ver este menú\n` +
                    `• hora - Hora El Salvador\n` +
                    `• ayuda - Instrucciones\n` +
                    `• buscar [palabra] - Buscar programas\n\n` +
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
        // Verificar si es admin
        const esAdmin = await FirebaseManager.esAdmin(usuario);
        if (!esAdmin) {
            await message.reply('❌ Solo administradores pueden programar.');
            return;
        }
        
        // Guía paso a paso
        await message.reply(`📝 *PROGRAMAR NUEVA IMAGEN/MENSAJE*\n\n` +
                          `Responde a este mensaje en orden:\n\n` +
                          `1. *NOMBRE:* Nombre de la programación\n` +
                          `2. *HORA:* Hora en formato HH:MM (24h)\n` +
                          `3. *IMAGEN:* Envía la imagen\n` +
                          `4. *MENSAJE:* Texto acompañante\n\n` +
                          `Ejemplo de respuesta:\n` +
                          `"Buenos días\\n09:00\\nBuen día grupo!"`);
        
        // Aquí necesitarías un sistema de conversación paso a paso
        // (Se implementa con un estado por usuario)
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
            lista += `👤 Miembros: ? (necesita permisos)\n`;
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
        // Verificar si el que envía el comando es admin
        const esAdmin = await FirebaseManager.esAdmin(usuario);
        
        if (!esAdmin) {
            await message.reply('❌ Solo administradores pueden usar este comando.');
            return;
        }
        
        if (args.length < 2) {
            await message.reply('❌ Uso: *admin add [número]*');
            return;
        }
        
        if (args[1] === 'add' && args[2]) {
            let numero = args[2];
            // Formatear número
            if (!numero.includes('@')) {
                numero = numero.replace(/\D/g, '');
                if (numero.startsWith('503')) {
                    numero = numero;
                } else {
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
                     `✅ Funciona 24/7 en la nube\n` +
                     `✅ Base de datos en Firebase\n` +
                     `✅ Hora El Salvador automática\n` +
                     `✅ Múltiples administradores`;
        
        await message.reply(ayuda);
    }
}

// ================== EVENTOS PRINCIPALES ==================
client.on('qr', qr => {
    console.log('\n📱 ESCANEA ESTE QR CON WHATSAPP:');
    qrcode.generate(qr, { small: true });
    console.log('\n✅ Escanea con WhatsApp Web');
});

client.on('ready', async () => {
    console.log('✅ BOT CONECTADO Y LISTO');
    console.log('🔥 Firebase activado');
    console.log('⏰ Programador iniciado');
    
    // Iniciar programador
    new Programador();
    
    // Agregar primer admin automáticamente
    const chats = await client.getChats();
    const primerosChats = chats.slice(0, 3);
    
    for (const chat of primerosChats) {
        if (!chat.isGroup) {
            await FirebaseManager.agregarAdmin(chat.id._serialized);
            console.log(`👑 Admin agregado: ${chat.id._serialized}`);
            break;
        }
    }
});

client.on('message', async message => {
    const texto = message.body.trim();
    const usuario = message.from;
    const esGrupo = message.from.includes('@g.us');
    
    // Ignorar mensajes del bot
    if (message.fromMe) return;
    
    console.log(`📨 [${esGrupo ? 'GRUPO' : 'PRIV'}] ${texto.substring(0, 50)}...`);
    
    // Activar en grupo
    if (texto.toLowerCase().includes('activar bot') && esGrupo) {
        const chat = await message.getChat();
        await FirebaseManager.guardarGrupo(message.from, chat.name);
        await message.reply('✅ *BOT ACTIVADO EN ESTE GRUPO!*\n\nLos mensajes programados se enviarán aquí automáticamente.');
        return;
    }
    
    // Manejar comandos
    if (texto.startsWith('!')) {
        await ComandoHandler.handle(message, texto.substring(1), usuario, esGrupo);
    }
    
    // Interacciones automáticas
    else if (!esGrupo) {
        if (texto.toLowerCase().includes('hola')) {
            await message.reply('¡Hola! 👋 Escribe *!menu* para ver todas las opciones.');
        }
    }
});

client.on('disconnected', (reason) => {
    console.log('⚠️ Bot desconectado:', reason);
    console.log('Reinicia con: node bot-firebase.js');
});

// ================== INICIAR ==================
console.log('🚀 Iniciando Bot WhatsApp con Firebase...');
console.log('📍 Hora El Salvador configurada');
client.initialize();

// Manejar cierre
process.on('SIGINT', () => {
    console.log('\n👋 Bot detenido. Los datos están seguros en Firebase.');
    process.exit(0);
});