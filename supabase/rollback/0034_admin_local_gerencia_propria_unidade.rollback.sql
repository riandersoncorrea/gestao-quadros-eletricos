-- Rollback da 0034: devolve o trigger de profiles ao texto da 0029 e remove a função auxiliar.
create or replace function public.check_profile_access_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- SQL Editor / service role (sem usuário na requisição) e admin geral: livre.
  if auth.uid() is null or public.is_global_admin() then
    return new;
  end if;
  if new.acesso_todas_unidades is distinct from old.acesso_todas_unidades then
    raise exception using errcode = '42501',
      message = 'Somente um administrador geral concede ou retira o acesso a todas as unidades';
  end if;
  if new.role is distinct from old.role and (old.role = 'admin' or new.role = 'admin') then
    raise exception using errcode = '42501',
      message = 'Somente um administrador geral concede ou retira o perfil de administrador';
  end if;
  if old.acesso_todas_unidades and old.id <> auth.uid()
     and (new.role, new.approved) is distinct from (old.role, old.approved) then
    raise exception using errcode = '42501',
      message = 'Somente um administrador geral altera o perfil de um administrador geral';
  end if;
  return new;
end;
$$;
drop function if exists public.admin_local_pode_gerenciar(uuid);
