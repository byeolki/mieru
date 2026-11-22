# Sourced by the mysql image entrypoint on the first start of an empty volume only.
# MYSQL_DATABASE is left unset on purpose so the image creates no database; the app's migration
# runner creates APP_DATABASE itself, and this grant is what lets the app account do that.
docker_process_sql --database=mysql <<SQL
GRANT ALL PRIVILEGES ON \`${APP_DATABASE:?}\`.* TO '${MYSQL_USER:?}'@'%';
SQL
