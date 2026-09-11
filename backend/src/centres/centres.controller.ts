import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ContexteRequete, CurrentUser, RequestContext, Roles, UtilisateurCourant } from '../common/decorators';
import { CentresService } from './centres.service';
import { CreerCentreDto, CreerPersonnelDto, ModifierCentreDto, ModifierPersonnelDto } from './dto/centre.dto';

@ApiTags('centres')
@ApiBearerAuth()
@Controller('centres')
export class CentresController {
  constructor(private readonly centres: CentresService) {}

  @Get()
  lister(@CurrentUser() acteur: UtilisateurCourant) {
    return this.centres.lister(acteur);
  }

  @Get(':id')
  obtenir(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() acteur: UtilisateurCourant) {
    return this.centres.obtenir(id, acteur);
  }

  @Post()
  @Roles(Role.ADMIN_NATIONAL)
  creer(@Body() dto: CreerCentreDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.centres.creer(dto, acteur, ctx);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_NATIONAL, Role.CHEF_CENTRE)
  modifier(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModifierCentreDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.centres.modifier(id, dto, acteur, ctx);
  }

  @Get(':id/personnel')
  @Roles(Role.ADMIN_NATIONAL, Role.CHEF_CENTRE, Role.PERSONNEL_SANTE)
  listerPersonnel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() acteur: UtilisateurCourant) {
    return this.centres.listerPersonnel(id, acteur);
  }

  @Post(':id/personnel')
  @Roles(Role.ADMIN_NATIONAL, Role.CHEF_CENTRE)
  ajouterPersonnel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreerPersonnelDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.centres.ajouterPersonnel(id, dto, acteur, ctx);
  }

  @Patch(':id/personnel/:pid')
  @Roles(Role.ADMIN_NATIONAL, Role.CHEF_CENTRE)
  modifierPersonnel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pid', ParseUUIDPipe) pid: string,
    @Body() dto: ModifierPersonnelDto,
    @CurrentUser() acteur: UtilisateurCourant,
    @RequestContext() ctx: ContexteRequete,
  ) {
    return this.centres.modifierPersonnel(id, pid, dto, acteur, ctx);
  }
}
