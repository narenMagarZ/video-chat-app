import { useEffect, useRef, useState } from 'react';
import './App.css';
import { BsMicMuteFill,BsMic } from "react-icons/bs";
import { IoCall } from "react-icons/io5";
import { FaVideo,FaVideoSlash } from "react-icons/fa";
import { FaPhoneSlash } from "react-icons/fa6";
import uuid from 'short-uuid'
import socket from './socket.io';


type userStatus = 'call'|'idle'

function App() {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const [localStream,setLocalStream] = useState<MediaStream|null>(null)
  const [pc,setPc] = useState<RTCPeerConnection>(new RTCPeerConnection())

  async function accessWebCam(){
    try{
      const stream1 = await navigator.mediaDevices.getUserMedia({audio:true,video:true})
      const stream2 = new MediaStream()
      setLocalStream(stream1)
      if(remoteVideoRef.current)
      remoteVideoRef.current.srcObject = stream2
      pc.ontrack = event=>{
        if(remoteVideoRef.current){
          remoteVideoRef.current.srcObject = event.streams[0]
        }
      }
      stream1.getTracks().forEach(track=>pc.addTrack(track,stream1))
    }
    catch(error){
      console.error("Error accessing media device:",error)
    }

  }
  useEffect(()=>{
    if(localVideoRef.current){
      localVideoRef.current.srcObject = localStream
    }
  },[localStream])

  const [isCalled,setIsCalled] = useState(false)

  const [members,setMembers] = useState<{id:string,name:string,status:userStatus}[]>([])
  const [data,setData] = useState<any>(null)
  const [userId,setUserId] = useState('')
  const [localUser,setLocalUser] = useState<{name:string,id:string,status:userStatus}>({
    name:'',id:'',status:'idle'
  })
  const [remoteUser,setRemoteUser] = useState<{
    name:string
    id:string,
    status:userStatus
  }>({name:'',id:'',status:'idle'})
  useEffect(()=>{
    accessWebCam()
  },[])
  useEffect(()=>{
    socket.on('members',(members)=>{
      setMembers(()=>members.filter((member:any)=>member.id!==userId))
    })
    socket.on('offer',async(data)=>{
      setIsCalled(true)
      setData(data)
    })
    socket.on('leave',({userId})=>{
      setMembers(prev=>prev.filter((m:any)=>m.id!==userId))
    })
    socket.on('status',(users)=>{
      setMembers(prevs=>{
        const m = prevs.map((prev)=>{
          prev = prev.id === users[0] || prev.id === users[1] || prev.status === 'call' ?
          {...prev,status:'call'} : {...prev}
          return prev
      })
        return m
      })
    })
    socket.on('end',()=>{
      setLocalUser(prev=>({...prev,status:'idle'}))
      const remoteUserId = remoteUser.id
      setRemoteUser({
        id:'',
        name:'',
        status:'idle'
      })
      setMembers(prevs=>{ 
        const m = prevs.map((prev)=>{
          prev = prev.id === remoteUserId ? {...prev,status:'idle'} : {...prev} 
          return prev
        })
        return m
      })
    })
    return()=>{
      socket.removeListener('members')
      socket.removeListener('status')
      socket.removeListener('end')
      socket.removeListener('offer')
      socket.removeListener('leave')
    }
  },[userId,remoteUser,localUser])
  const [name,setName] = useState('')

  // submit user to signaling server with name and id
  function submitUser(){
    if(pc.connectionState === 'connected'){
      return
    }
    if(name){
      const userId = uuid.generate()
      setUserId(userId)
      setLocalUser({
        id:userId,
        name,
        status:'idle'
      })
      socket.emit('new-member',{name,userId})
    }

  }

  async function makeCall(remoteUser:{id:string,name:string}){
    if(pc.connectionState==='closed'){
      setPc(new RTCPeerConnection())
    }
    if(localUser.status === 'call')
      return
    const {id,name} = remoteUser
    setLocalUser(prev=>({...prev,status:'call'}))
    setRemoteUser({id,name,status:'call'})
    pc.onicecandidate = event=>{
      if(event.candidate){
        socket.emit('candidate',{
          targetId:id,
          yourId:userId,
          candidate:event.candidate
        })   
      }
    }
    const offer = await pc.createOffer()
    pc.setLocalDescription(offer)
    socket.emit('offer',{
      remoteUser,
      localUser,
      targetId:id,
      yourId:userId,
      offer:{
        type:offer.type,
        sdp:offer.sdp
      }
    })

    socket.on('answer',async(data)=>{
        setIsCalled(true)
        const answerDescription = new RTCSessionDescription(data.answer)
        await pc.setRemoteDescription(answerDescription)
    })
    socket.on('candidate',(data)=>{
      const candidate = new RTCIceCandidate(data.candidate)
      pc.addIceCandidate(candidate)
    })
  }

  async function acceptCall(){
    setRemoteUser(data.remoteUser)
    setLocalUser(prev=>({...prev,status:'call'}))
    pc.onicecandidate = event=>{
      if(event.candidate){
        socket.emit('candidate',{
          targetId:data.yourId,
          candidate:event.candidate
        })
      }
    }
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket.emit('answer',{
      targetId:data.yourId,
      answer:{
        sdp:answer.sdp,
        type:answer.type
      }
    })
    socket.on('candidate',async(data)=>{
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
    })
  }
  function endCall(){
      pc.close()
      socket.emit('end',{localUser,remoteUser})
      setMembers(prev=>{
        const m = prev.map((p)=>{
           p = p.id === remoteUser.id ? {...p,status:'idle'} : p
           return p
        })
        return m
      })
      setRemoteUser({id:'',name:'',status:'idle'})
      setLocalUser({id:'',name:'',status:'idle'})
  }
  function rejectCall(){

  }
  return (
    <div className="flex flex-col gap-2 items-center p-4 min-h-screen bg-gray-100">
      <div className='flex items-center gap-1'>
        <div className='border relative'>
            <video className='w-[400px]' ref={localVideoRef} autoPlay playsInline/>
            <div className='absolute bottom-0 p-2 flex items-center'>
                <BsMicMuteFill color='red'/>
                <span className='bg-black rounded px-2 text-sm text-white'>{name}</span>
            </div>
        </div>
        <div className='border relative'>
          <video className='w-[400px]' ref={remoteVideoRef} playsInline autoPlay />
          {
            isCalled && <div className='absolute bottom-0 p-2 flex items-center'>
            <BsMicMuteFill color='red'/>
            <span className='bg-black rounded px-2 text-sm text-white'>{remoteUser.name}</span>
          </div>
          }

        </div>
      </div>
      <div className='max-w-[30%] w-full m-2'>
        <div className='flex items-center gap-x-4 justify-center'>
          <button className='hover:bg-slate-200 rounded-full p-2'>
            <BsMic size={20} className='' />
          </button>
          <button className='hover:bg-slate-200 rounded-full p-2'>
            <FaVideo size={20}/>
          </button>
          <button 
          onClick={endCall}
          className='hover:bg-slate-200 rounded-full p-2 '>
            <IoCall size={20} className='' color='red'/>
          </button>
        </div>
      </div>
      {/* <VideoController/> */}
      <div className='flex flex-col gap-y-2'>
        <input 
        value={name}
        onChange={(e)=>{
          setName(e.currentTarget.value)
        }}
        className='border rounded text-sm px-2 py-1' placeholder='Enter your name' />
        <button 
        onClick={submitUser}
        className='bg-blue-600 rounded px-2 py-1 text-sm text-white hover:bg-blue-700'>
          submit 
        </button>
      </div>
      <div className='flex flex-col gap-y-2 bg-slate-200 border p-2 rounded max-h-[300px] overflow-auto'>
        <h5 className='font-semibold text-gray-800'>Participants</h5>
        {
          members.map(({id,name,status})=>(
            <div key={id} className='flex items-center gap-x-1 '>
              <div className='flex items-center gap-x-1'>
                <span className='font-semibold text-sm'>{name}</span>
                <span className='text-sm text-gray-700'>({id})</span>
              </div>
              <div>
                {
                  status === 'call' ? <button
                  className='bg-slate-200 hover:bg-slate-300 rounded-full p-2'>
                    <FaPhoneSlash />
                    </button> : 
                    <button
                    onClick={()=>makeCall({id,name})}
                    className='bg-slate-200 hover:bg-slate-300 rounded-full p-2'>
                      <IoCall color='green' size={16} />
                    </button>
                }
              </div>
            </div>
          ))
        }
      </div>
      <div className='flex items-center gap-1'>
        {
          isCalled && <button 
          onClick={acceptCall}
          className='bg-green-600 hover:bg-green-700 rounded px-2 py-1 text-sm text-white'>Accept call</button>
        }
        <button
        onClick={rejectCall}
        className='bg-red-600 rounded hover:bg-red-700 px-2 py-1 text-sm text-white'
        >
          Reject call
        </button>
      </div>
    </div>
  );
}

export default App;


function VideoController(){
  return(
    <div className='max-w-[30%] w-full m-2'>
      <div className='flex items-center gap-x-4 justify-center'>
        <button className='hover:bg-slate-200 rounded-full p-2'>
          <BsMic size={20} className='' />
        </button>
        <button className='hover:bg-slate-200 rounded-full p-2'>
          <FaVideo size={20}/>
        </button>
        <button className='hover:bg-slate-200 rounded-full p-2 '>
          <IoCall size={20} className='' color='red'/>
        </button>
      </div>
    </div>
  )
}