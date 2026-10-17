/* Owns transport only. STT should subscribe to the audioTrack event. */
class SalesAgentCommunications extends EventTarget {
  constructor(){super();this.room=null;this.mic=null;this.callId=null;this.cursor=0;this.timer=null;this.nodes=new Map();this.connecting=false;this.connected=false;this.polling=false;}
  emit(type, detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
  async request(route,body){
    const response=await fetch('/api/comms/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Comms-Action':'1'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Communications request failed');return data;
  }
  async limit(promise,ms,message){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms)})])}finally{clearTimeout(timer)}}
  async connect(){
    if(this.connecting||this.connected)return;
    this.connecting=true;let expired=false,room,mic;
    try{
      const sdk=window.LivekitClient;
      if(!sdk||!navigator.mediaDevices?.getUserMedia)throw Error('Open this page in Chrome with microphone access.');
      this.emit('status',{message:'Allow microphone access…'});
      const capture=sdk.createLocalAudioTrack({echoCancellation:true,noiseSuppression:true,autoGainControl:true});
      capture.then(t=>{if(expired)t.stop()},()=>{});
      mic=await this.limit(capture,25000,'Microphone permission timed out. Allow access in Chrome and try again.');
      const auth=await this.request('seller-token',{});
      room=new sdk.Room();this.room=room;this.mic=mic;
      room.on(sdk.RoomEvent.TrackSubscribed,(track,publication,participant)=>{
        if(track.kind!==sdk.Track.Kind.Audio||!participant.identity.startsWith('outbound-'))return;
        const callId=participant.identity.slice('outbound-'.length);
        const element=track.attach();element.autoplay=true;document.body.append(element);this.nodes.set(track.sid,element);
        element.play().catch(()=>this.emit('playbackBlocked',{}));
        this.emit('audioTrack',{role:'customer',track:track.mediaStreamTrack,participant:participant.identity,callId});
      });
      room.on(sdk.RoomEvent.TrackUnsubscribed,(track,publication,participant)=>{
        const node=this.nodes.get(track.sid);if(node){track.detach(node);node.remove();this.nodes.delete(track.sid)}
        this.emit('audioTrackEnded',{role:'customer',participant:participant.identity,callId:participant.identity.replace('outbound-','')});
      });
      room.on(sdk.RoomEvent.Disconnected,()=>{
        mic.stop();this.connected=false;this.connecting=false;
        if(this.timer)clearInterval(this.timer);this.timer=null;
        for(const node of this.nodes.values())node.remove();this.nodes.clear();
        this.emit('audioTrackEnded',{role:'rep',participant:'seller-browser',callId:this.callId});
        this.emit('status',{message:'Audio disconnected',connected:false});
      });
      this.emit('status',{message:'Connecting call audio…'});
      await this.limit(room.connect(auth.url,auth.token),20000,'LiveKit connection timed out');
      await this.limit(room.localParticipant.publishTrack(mic,{source:sdk.Track.Source.Microphone}),15000,'Microphone publish timed out');
      this.emit('audioTrack',{role:'rep',track:mic.mediaStreamTrack,participant:'seller-browser',callId:null});
      room.startAudio().catch(()=>this.emit('playbackBlocked',{}));
      this.connected=true;this.emit('status',{message:'Microphone connected',connected:true});
      this.timer=setInterval(()=>this.poll(),650);await this.poll();
    }catch(error){expired=true;mic?.stop();room?.disconnect().catch(()=>{});this.room=null;this.mic=null;this.connected=false;throw error}
    finally{this.connecting=false}
  }
  async poll(){
    if(this.polling)return;this.polling=true;
    try{
      const events=await this.request('events?after='+this.cursor);
      if(events.gap)this.emit('eventGap',{message:'Some in-memory events expired. Refresh call state.'});
      for(const event of events.events)this.emit('callEvent',event);
      this.cursor=events.cursor;
      const state=await this.request('state');this.callId=state.call?.callId||null;this.emit('state',state);
    }catch(error){this.emit('error',{message:error.message})}finally{this.polling=false}
  }
  async dial(recipient){if(!this.connected)throw Error('Connect microphone first');const call=await this.request('dial',{recipient:recipient.replace(/[\s()-]/g,'')});this.callId=call.callId;this.emit('callStarted',call);return call;}
  async hangup(){if(this.callId)await this.request('hangup',{callId:this.callId});await this.poll();}
  async mute(muted){if(muted)await this.mic?.mute();else await this.mic?.unmute();}
  async enableSound(){await this.room?.startAudio();}
  async followup(recipient,text,requestId){return this.request('followup',{recipient,text,requestId});}
  async disconnect(){await this.hangup();await this.room?.disconnect();this.mic?.stop();if(this.timer)clearInterval(this.timer);this.connected=false;}
}
window.SalesAgentCommunications=SalesAgentCommunications;
