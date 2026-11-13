import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ChangerMotDePasseDto, LoginDto, MotDePasseOublieDto, RefreshDto, ReinitialiserMotDePasseDto } from './dto/auth.dto';
import { ContexteRequete, CurrentUser, Public, RequestContext, UtilisateurCourant } from '../common/decorators';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @RequestContext() ctx: ContexteRequete) {
    const identifiant = dto.identifiant ?? dto.email;
    if (!identifiant) throw new BadRequestException("Adresse e-mail ou nom d'utilisateur requis");
    return this.auth.login(identifiant, dto.motDePasse, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @RequestContext() ctx: ContexteRequete) {
    return this.auth.refresh(dto.refreshToken, ctx);
  }

  /**
   * Demande d'un lien de reinitialisation. Quota serre : la route revele, par
   * son seul usage repete, qu'on cherche des comptes, et chaque appel declenche
   * l'envoi d'un courriel.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('mot-de-passe-oublie')
  @HttpCode(200)
  motDePasseOublie(@Body() dto: MotDePasseOublieDto, @RequestContext() ctx: ContexteRequete) {
    return this.auth.demanderReinitialisation(dto.identifiant, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reinitialiser-mot-de-passe')
  @HttpCode(200)
  reinitialiserMotDePasse(@Body() dto: ReinitialiserMotDePasseDto, @RequestContext() ctx: ContexteRequete) {
    return this.auth.reinitialiserMotDePasse(dto.jeton, dto.nouveauMotDePasse, ctx);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  logout(
    @Body() dto: Partial<RefreshDto>,
    @CurrentUser() user: UtilisateurCourant,
    @RequestContext() ctx: ContexteRequete,
  ) {
    return this.auth.logout(dto.refreshToken, user, ctx);
  }

  @ApiBearerAuth()
  @Post('mot-de-passe')
  @HttpCode(200)
  changerMotDePasse(@Body() dto: ChangerMotDePasseDto, @CurrentUser() user: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.auth.changerMotDePasse(user, dto.ancienMotDePasse, dto.nouveauMotDePasse, ctx);
  }

  @ApiBearerAuth()
  @Get('moi')
  moi(@CurrentUser() user: UtilisateurCourant) {
    return user;
  }
}
