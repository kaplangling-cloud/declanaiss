import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ContexteRequete, CurrentUser, RequestContext, Roles, UtilisateurCourant } from '../common/decorators';
import { UsersService } from './users.service';
import { CreerUtilisateurDto, ModifierUtilisateurDto } from './dto/user.dto';

@ApiTags('utilisateurs')
@ApiBearerAuth()
@Controller('utilisateurs')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(Role.ADMIN_NATIONAL, Role.CHEF_CENTRE, Role.OFFICIER_ETAT_CIVIL)
  lister(@CurrentUser() acteur: UtilisateurCourant) {
    return this.users.lister(acteur);
  }

  @Post()
  @Roles(Role.ADMIN_NATIONAL, Role.CHEF_CENTRE, Role.OFFICIER_ETAT_CIVIL)
  creer(@Body() dto: CreerUtilisateurDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.users.creer(dto, acteur, ctx);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_NATIONAL, Role.CHEF_CENTRE, Role.OFFICIER_ETAT_CIVIL)
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModifierUtilisateurDto,
    @CurrentUser() acteur: UtilisateurCourant,
    @RequestContext() ctx: ContexteRequete,
  ) {
    return this.users.modifier(id, dto, acteur, ctx);
  }
}
