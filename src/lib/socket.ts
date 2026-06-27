import { io } from 'socket.io-client'

export const getServerOrigin = () => {
  const host = window.location.hostname || '127.0.0.1'
  return `${window.location.protocol}//${host}:3001`
}

export const socket = io(getServerOrigin(), {
  autoConnect: false,
  transports: ['websocket', 'polling'],
})
