import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { ContexteRequete, CurrentUser, RequestContext, Roles, UtilisateurCourant } from '../common/decorators';
import { ActesService } from './actes.service';
import { EditerActeDto } from './dto/acte.dto';

@ApiTags('actes')
@ApiBearerAuth()
@Controller('actes')
export class ActesController {
  constructor(private readonly actes: ActesService) {}

  @Get()
  lister(@CurrentUser() acteur: UtilisateurCourant, @Query('annee', new ParseIntPipe({ optional: true })) annee?: number) {
    return this.actes.lister(acteur, annee);
  }

  @Get(':id')
  obtenir(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() acteur: UtilisateurCourant) {
    return this.actes.obtenir(id, acteur);
  }

  /** Edition finale de l'acte avec generation du PDF + code-barres/QR. */
  @Post('declaration/:declarationId')
  @Roles(Role.OFFICIER_ETAT_CIVIL)
  editer(@Param('declarationId', ParseUUIDPipe) declarationId: string, @Body() dto: EditerActeDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.actes.editer(declarationId, dto, acteur, ctx);
  }

  @Get(':id/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete, @Res() res: Response) {
    const { pdf, nom } = await this.actes.telechargerPdf(id, acteur, ctx);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nom}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  }
}
