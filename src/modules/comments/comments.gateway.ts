import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ namespace: 'comments' })
export class CommentsGateway {
    @WebSocketServer() server: Server;

    /** Called by the service whenever a new comment is created */
    notifyNewComment() {
        this.server.emit('commentCreated');
    }
}
