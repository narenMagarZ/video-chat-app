import app from './app'
import  { Server, Socket } from 'socket.io'
import http from 'http'

const port = process.env.PORT || 5000

interface UserProps {
	socket:Socket
	name:string
	socketId:string
	status:'call'|'idle'
}
const members = new Map<string,UserProps>()

const server = http.createServer(app)

const io = new Server(server,{
	cors:{
		'origin':'http://localhost:3000'
	}
})

function getMembers(){
	const ms :{id:string,name:string,status:'call'|'idle'}[] = []
	const keys = members.keys()
	for(let key of Array.from(keys)){
		ms.push({
			id:key,
			name:members.get(key)?.name || '',
			status:members.get(key)?.status || 'idle'
		})
	}
	return ms
}
io.on('connection',(socket)=>{
	console.log('User connected')
	socket.on('new-member',({name,userId})=>{
		if(userId && name){
			members.set(userId,{
				socket,
				name,
				socketId:socket.id,
				status:'idle'
			})
		}
		const ms = getMembers()
		for(const member of ms){
			members.get(member.id)?.socket.emit('members',ms)
		}
	})
	
	socket.on('offer',(data)=>{
		const remoteUser = members.get(data.remoteUser.id)
		const localUser = members.get(data.localUser.id)
		if(remoteUser && localUser){
			remoteUser.status = 'call'
			localUser.status = 'call'
			members.set(data.remoteUser.id,remoteUser)
			members.set(data.localUser.id,localUser)
			remoteUser.socket.emit('offer',{...data,
				localUser:{
					id:data.remoteUser.id,
					name:remoteUser.name,
					status:remoteUser.status
				},
				remoteUser:{
					id:data.localUser.id,
					name:localUser.name,
					status:localUser.status
				}
			})
			const ms = getMembers()
			for(const m of ms){
				members.get(m.id)?.socket.emit('status',[data.remoteUser.id,data.localUser.id])
			}
		}
	})
	socket.on('answer',(data)=>{
		const member = members.get(data.targetId)
		if(member){
			member.socket.emit('answer',data)
		}
	})
	socket.on('candidate',(data)=>{
		const member = members.get(data.targetId)
		if(member){
			member.socket.emit('candidate',data)
		}
	})
	
	socket.on('end',({remoteUser,localUser})=>{
		console.log(remoteUser,localUser)
		const r = members.get(remoteUser.id)
		const l = members.get(localUser.id)
		if(l && r){
			r.status = 'idle'
			l.status = 'idle'
			members.set(remoteUser.id,r)
			members.set(localUser.id,l)
			r.socket.emit('end')
		}
	})
	socket.on('disconnect',()=>{
		console.log('User disconnected')
		const ms = getMembers()
		for(const member of ms){
			const m = members.get(member.id)
			if(socket.id === m?.socketId){
				members.delete(member.id)
				m.socket.broadcast.emit('leave',{userId:member.id})
				break
			}
		}
	})



})



server.listen(port,()=>{
	console.log("server is listening on port",port)
})
