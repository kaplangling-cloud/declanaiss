import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { ContexteRequete, CurrentUser, RequestContext, Roles, UtilisateurCourant } from '../common/decorators';
import { DeclarationsService } from './declarations.service';
import {
  AjouterPieceDto, CreerDeclarationDto, DeciderRectificationDto, DemanderRectificationDto, ListerDeclarationsDto,
  LotSyncDto, ModifierDeclarationDto, RejeterDto,
} from './dto/declaration.dto';

const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_SIZE_MB || 8) * 1024 * 1024;

@ApiTags('declarations')
@ApiBearerAuth()
@Controller('declarations')
export class DeclarationsController {
  constructor(private readonly declarations: DeclarationsService) {}

  @Get()
  lister(@Query() q: ListerDeclarationsDto, @CurrentUser() acteur: UtilisateurCourant) {
    return this.declarations.lister(q, acteur);
  }

  @Get('resume')
  resume(@CurrentUser() acteur: UtilisateurCourant) {
    return this.declarations.resume(acteur);
  }

  @Post()
  @Roles(Role.PERSONNEL_SANTE, Role.CHEF_CENTRE)
  creer(@Body() dto: CreerDeclarationDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.declarations.creer(dto, acteur, ctx);
  }

  /** File de synchronisation hors-ligne : lot d'elements, reponse element par element. */
  @Post('sync')
  @Roles(Role.PERSONNEL_SANTE, Role.CHEF_CENTRE)
  @HttpCode(200)
  synchroniser(@Body() lot: LotSyncDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.declarations.synchroniser(lot, acteur, ctx);
  }

  @Get(':id')
  obtenir(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.declarations.obtenir(id, acteur, ctx);
  }

  @Patch(':id')
  @Roles(Role.PERSONNEL_SANTE, Role.CHEF_CENTRE)
  modifier(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModifierDeclarationDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.declarations.modifier(id, dto, acteur, ctx);
  }

  @Post(':id/soumettre')
  @Roles(Role.PERSONNEL_SANTE, Role.CHEF_CENTRE)
  @HttpCode(200)
  soumettre(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.declarations.soumettre(id, acteur, ctx);
  }

  @Post(':id/valider')
  @Roles(Role.OFFICIER_ETAT_CIVIL)
  @HttpCode(200)
  valider(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.declarations.valider(id, acteur, ctx);
  }

  @Post(':id/rejeter')
  @Roles(Role.OFFICIER_ETAT_CIVIL)
  @HttpCode(200)
  rejeter(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejeterDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.declarations.rejeter(id, dto.motif, acteur, ctx);
  }

  /** Declaration imprimable, remise aux parents pour le guichet de la mairie. */
  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() acteur: UtilisateurCourant,
    @RequestContext() ctx: ContexteRequete,
    @Res() res: Response,
  ) {
    const { pdf, nom } = await this.declarations.genererPdf(id, acteur, ctx);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nom}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  }

  // ---- Pieces jointes ----

  @Post(':id/pieces')
  @Roles(Role.PERSONNEL_SANTE, Role.CHEF_CENTRE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: MAX_UPLOAD, files: 1 } }))
  ajouterPiece(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AjouterPieceDto,
    @UploadedFile() fichier: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    @CurrentUser() acteur: UtilisateurCourant,
    @RequestContext() ctx: ContexteRequete,
  ) {
    return this.declarations.ajouterPiece(id, dto.type, fichier, acteur, ctx);
  }

  @Get(':id/pieces/:pieceId')
  async telechargerPiece(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pieceId', ParseUUIDPipe) pieceId: string,
    @CurrentUser() acteur: UtilisateurCourant,
    @RequestContext() ctx: ContexteRequete,
    @Res() res: Response,
  ) {
    const { contenu, mimeType, nom } = await this.declarations.telechargerPiece(id, pieceId, acteur, ctx);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nom)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(contenu);
  }

  @Delete(':id/pieces/:pieceId')
  @Roles(Role.PERSONNEL_SANTE, Role.CHEF_CENTRE)
  retirerPiece(@Param('id', ParseUUIDPipe) id: string, @Param('pieceId', ParseUUIDPipe) pieceId: string, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.declarations.retirerPiece(id, pieceId, acteur, ctx);
  }

  // ---- Rectification ----

  @Post(':id/rectifications')
  @Roles(Role.OFFICIER_ETAT_CIVIL, Role.ADMIN_NATIONAL)
  demanderRectification(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DemanderRectificationDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.declarations.demanderRectification(id, dto, acteur, ctx);
  }

  @Post(':id/rectifications/:rectifId/decision')
  @Roles(Role.OFFICIER_ETAT_CIVIL, Role.ADMIN_NATIONAL)
  @HttpCode(200)
  deciderRectification(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rectifId', ParseUUIDPipe) rectifId: string,
    @Body() dto: DeciderRectificationDto,
    @CurrentUser() acteur: UtilisateurCourant,
    @RequestContext() ctx: ContexteRequete,
  ) {
    return this.declarations.deciderRectification(id, rectifId, dto, acteur, ctx);
  }
}
