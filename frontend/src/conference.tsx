import { useEffect, useRef, useState } from 'react'
import { BsMicMuteFill } from "react-icons/bs";
import socket from './socket.io'


export default function Conference(){
    const [localStream,setLocalStream] = useState<MediaStream|null>(null)
    const [remoteStreams,setRemoteStreams] = useState<any[]>([])
    const localVideoRef = useRef<HTMLVideoElement>(null)
    const remoteVideoRef = useRef<HTMLVideoElement>(null)
    async function setupMedia(){
        console.count('count ')
        const pc = new RTCPeerConnection({
            iceServers:[{urls:'stun:stun2.l.google.com:19302'}]
        })
        const localStream = await navigator.mediaDevices.getUserMedia({video:true,audio:true})
        const remoteStream = new MediaStream()
        localStream.getTracks().forEach(track=>pc.addTrack(track,localStream))
        
        pc.onicecandidate = event =>{
            if(event.candidate){
                socket.emit('candidate',event.candidate)
            }
        }
        pc.ontrack = event =>{
            event.streams[0].getTracks().forEach(track=>remoteStream.addTrack(track))
        }
        if(localVideoRef.current){
            localVideoRef.current.srcObject = localStream 
        }
        if(remoteVideoRef.current){
            remoteVideoRef.current.srcObject = remoteStream
        }
        // create an offer
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        // listen for remote answer
        socket.emit('offer',{
            sdp:offer.sdp,
            type:offer.type
        })
        socket.on('answer',(data)=>{
            if(!pc.currentRemoteDescription && data.answer){
                const answerDescription = new RTCSessionDescription(data.answer)
                pc.setRemoteDescription(answerDescription)
            }
        })
        // when answered, add candidates to peer connection
        socket.on('candidate',(data)=>{

        })

    }
    useEffect(()=>{
        setupMedia()
    },[])

    return(
        <div className="bg-gray-100 p-2">
            <div className='flex gap-2'>
                <video ref={localVideoRef} autoPlay playsInline/>
            </div>
            <div>
                <video ref={remoteVideoRef} playsInline autoPlay />
            </div>
        </div>
    )
}
